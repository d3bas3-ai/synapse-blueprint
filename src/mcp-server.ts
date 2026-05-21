#!/usr/bin/env node
/**
 * Synapse MCP Server — LLM-agnostic
 * Reads/writes the project blueprint via BLUEPRINT_PATH env var.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Blueprint, BlueprintNode } from './types';

const argIdx = process.argv.indexOf('--blueprint');
const BLUEPRINT_PATH =
  (argIdx !== -1 ? process.argv[argIdx + 1] : null) ??
  process.env.BLUEPRINT_PATH ??
  path.join(process.cwd(), 'blueprint.json');

const STORAGE_DIR    = path.dirname(BLUEPRINT_PATH);
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? process.cwd();
const SNAPSHOT_SLOTS = 5;
const CHANGELOG_CAP  = 500;

// ── Server instructions (injected into LLM context at MCP initialize) ─────────
function buildServerInstructions(projectName: string): string {
  const name = projectName || 'this project';
  return `# Synapse Blueprint — Session Rules

You are connected to the Synapse node map for **${name}**.

## Session start — every session, including continuations

1. Call \`synapse_summary\` first for a compact one-line-per-node overview of the full project.
2. Then call \`synapse_context\`. If the project has more than 30 nodes use filters (filter_type, filter_status, or keyword) — never load the full map unfiltered on a large project.
3. Then begin work.

## File operations — every time you touch a file

4. Created or wrote a file → call \`synapse_add_node\` immediately, in the same step, before moving on.
5. Modified an existing file → call \`synapse_update_node\` immediately, in the same step.
6. Found a relationship between components → call \`synapse_link\`.

## Before modifying anything

7. Call \`synapse_impact\` with the node's ID before changing any node or its file. It shows every upstream and downstream node affected — the full blast radius. This is the primary guardrail against destructive changes.

## Completing work

8. Before setting any node to status=done, call \`synapse_checkpoint\` first. Then call \`synapse_update_node\` with status=done.
9. The blueprint is ground truth. Never rely on session memory — always read fresh state from the tools.

## Validating the map

10. Call \`synapse_validate\` if the session has involved file renames, deletions, or restructuring. It checks every file_path against the real filesystem and surfaces stale nodes.

## Tool schemas

9. Synapse tool schemas are session-scoped and may be deferred. Load them at session start before any calls or you will get a schema error.

## User-created nodes  [USER] in context · [U] in summary

10. Nodes marked [USER] were placed by the user directly on the canvas. They are protected.
11. Before modifying a user node: tell the user which node(s) you need to change and why, wait for their explicit confirmation, then call \`synapse_update_node\` with confirmed: true. Batch confirmation for a group of nodes within the same task is fine.
12. "Remove all", "clean up", "delete everything", or any other general instruction does NOT count as permission for user nodes. Permission means the user specifically names or confirms a specific node in direct response to your question.
13. \`synapse_remove_node\` is hard-blocked for user nodes without confirmed: true. Always ask first — the tool will reject the call otherwise.
14. Permission is task-scoped. Each new task starts with protection fully reinstated.
15. After a rollback, list which user-created nodes were left untouched so the user can review them.

## Closing nodes correctly

16. User-added todo and problem nodes are task assignments — treat them as explicit user requests, not just notes to acknowledge.
17. When closing a node: set status=done, flip type to done, write root cause in description, write exact fix location (file, line, function) in notes.
18. description = what was wrong and what was found. notes = exact file, line, function.

## Node descriptions from the user

19. User-added node descriptions express intent, not full specification. Investigate the actual code before acting — do not treat the description as a complete spec.`;
}

// ── File helpers ──────────────────────────────────────────────────────────────
function read(): Blueprint {
  if (!fs.existsSync(BLUEPRINT_PATH)) {
    const dir = path.dirname(BLUEPRINT_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const empty: Blueprint = {
      version: '1.0', project: path.basename(process.cwd()),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      nodes: [], edges: [],
    };
    fs.writeFileSync(BLUEPRINT_PATH, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }
  return JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf-8'));
}

function write(b: Blueprint) {
  b.updated_at = new Date().toISOString();
  fs.writeFileSync(BLUEPRINT_PATH, JSON.stringify(b, null, 2), 'utf-8');
}

function appendChangelog(action: string, label: string, details?: string) {
  const logPath = path.join(STORAGE_DIR, 'changelog.json');
  let log: { entries: Array<{ time: string; action: string; label: string; details?: string }> } = { entries: [] };
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch {}
  }
  log.entries.push({ time: new Date().toISOString(), action, label, details });
  if (log.entries.length > CHANGELOG_CAP) log.entries = log.entries.slice(-CHANGELOG_CAP);
  try { fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8'); } catch {}
}

function getNextSnapshotSlot(): number {
  for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
    if (!fs.existsSync(path.join(STORAGE_DIR, `snapshot-${i}.json`))) return i;
  }
  let times: { slot: number; time: number }[] = [];
  for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, `snapshot-${i}.json`), 'utf-8'));
      times.push({ slot: i, time: d._snapshot_time ? new Date(d._snapshot_time).getTime() : 0 });
    } catch { return i; }
  }
  times.sort((a, b) => a.time - b.time);
  return times[0].slot;
}

// ── Server ────────────────────────────────────────────────────────────────────
const _startupBlueprint = (() => { try { return read(); } catch { return null; } })();
const server = new Server(
  { name: 'synapse', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions: buildServerInstructions(_startupBlueprint?.project ?? ''),
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'synapse_summary',
      description: 'Get a compact one-line-per-node overview of the entire project map. Much lower token cost than synapse_context.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'synapse_context',
      description: 'Get the full project blueprint with complete node details. Optional filters reduce token cost on large projects.',
      inputSchema: {
        type: 'object',
        properties: {
          filter_type:   { type: 'string', description: 'Only return nodes of this type (feature, component, decision, etc.)' },
          filter_status: { type: 'string', description: 'Only return nodes with this status (planned, in-progress, done, blocked)' },
          keyword:       { type: 'string', description: 'Only return nodes where label, description, or notes contain this keyword' },
        },
      },
    },
    {
      name: 'synapse_add_node',
      description: `Add a node to the project blueprint.

ASSIGN TYPES USING THESE EXACT RULES:
- dependency: ANYTHING external — npm/pip packages, third-party APIs, databases, cloud services. If imported from outside the project, it is a dependency.
- feature: user-facing capabilities the end user directly sees, triggers, or configures.
- decision: architectural choices and reasoning — things that COULD have been done differently.
- component: internal code files written AS PART OF THIS PROJECT only.
- research: open questions needing investigation before a decision can be made.
- todo: pending tasks or action items.
- problem: known bugs, blockers, or design flaws.
- note: reference context or constraints that do not fit elsewhere.
- done: completed items kept for traceability.`,
      inputSchema: {
        type: 'object',
        required: ['label', 'type', 'description'],
        properties: {
          label:       { type: 'string' },
          type:        { type: 'string', enum: ['feature','component','decision','dependency','research','todo','done','problem','note'] },
          status:      { type: 'string', enum: ['planned','in-progress','done','blocked'], default: 'planned' },
          priority:    { type: 'string', enum: ['high','medium','low'], description: 'Optional priority level' },
          description: { type: 'string' },
          notes:       { type: 'string' },
          file_path:   { type: 'string' },
          position_x:  { type: 'number' },
          position_y:  { type: 'number' },
        },
      },
    },
    {
      name: 'synapse_update_node',
      description: 'Update an existing node by ID. Only the fields you provide are changed.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id:          { type: 'string' },
          label:       { type: 'string' },
          type:        { type: 'string', enum: ['feature','component','decision','dependency','research','todo','done','problem','note'] },
          status:      { type: 'string', enum: ['planned','in-progress','done','blocked'] },
          priority:    { type: 'string', enum: ['high','medium','low'] },
          description: { type: 'string' },
          notes:       { type: 'string' },
          file_path:   { type: 'string' },
          confirmed:   { type: 'boolean', description: 'Set true after receiving explicit user permission to modify a user-created node' },
        },
      },
    },
    {
      name: 'synapse_link',
      description: 'Connect two nodes with a directed edge. Use to show "depends on", "calls", "produces", "validates", "blocked by", etc.',
      inputSchema: {
        type: 'object',
        required: ['source_id', 'target_id'],
        properties: {
          source_id: { type: 'string' },
          target_id: { type: 'string' },
          label:     { type: 'string' },
        },
      },
    },
    {
      name: 'synapse_remove_node',
      description: 'Remove a node and all its edges. User-created nodes require confirmed: true — the call is rejected without it.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id:        { type: 'string' },
          reason:    { type: 'string' },
          confirmed: { type: 'boolean', description: 'Required true to remove a user-created node after receiving explicit user permission' },
        },
      },
    },
    {
      name: 'synapse_set_project',
      description: 'Set the project name. Call at the start of a new project or to rename.',
      inputSchema: {
        type: 'object',
        required: ['project_name'],
        properties: { project_name: { type: 'string' } },
      },
    },
    {
      name: 'synapse_checkpoint',
      description: 'Save a snapshot of the current project map. The snapshot is shown as a rollback indicator on the canvas.',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Optional label for this checkpoint' },
        },
      },
    },
    {
      name: 'synapse_changelog',
      description: 'Show recent project changelog — what nodes were added, updated, removed, or checkpointed across sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of recent entries to show (default 20)' },
        },
      },
    },
    {
      name: 'synapse_impact',
      description: 'Show the blast radius of changing a node — all upstream and downstream nodes reachable via edges, grouped by hop distance. Call this before modifying any node to understand what else is affected.',
      inputSchema: {
        type: 'object',
        required: ['node_id'],
        properties: {
          node_id: { type: 'string', description: 'ID of the node to analyse' },
        },
      },
    },
    {
      name: 'synapse_validate',
      description: 'Check every node that has a file_path against the actual workspace filesystem. Reports stale paths (file deleted or renamed) and unanchored component nodes with no file_path.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {

      // ── synapse_summary ────────────────────────────────────────────────────
      case 'synapse_summary': {
        const b = read();
        const lines = [
          `# ${b.project} — Quick Map`,
          `${b.nodes.length} nodes, ${b.edges.length} edges`,
          `Updated: ${new Date(b.updated_at).toLocaleString()}`,
          '',
        ];
        for (const n of b.nodes) {
          const out = b.edges.filter(e => e.source === n.id)
            .map(e => b.nodes.find(x => x.id === e.target)?.label ?? e.target);
          const inc = b.edges.filter(e => e.target === n.id)
            .map(e => b.nodes.find(x => x.id === e.source)?.label ?? e.source);
          const pri     = n.priority ? `, ${n.priority}` : '';
          const userTag = n.source === 'user' ? ' [U]' : '';
          const conn    = [
            inc.length ? `← ${inc.join(', ')}` : '',
            out.length ? `→ ${out.join(', ')}` : '',
          ].filter(Boolean).join('  ');
          lines.push(`[${n.type}] ${n.label}${userTag} (${n.status}${pri})${conn ? '  ' + conn : ''}`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // ── synapse_context ────────────────────────────────────────────────────
      case 'synapse_context': {
        const b = read();
        const lines: string[] = [];

        // Rollback notice — shown if the user just did an undo from the canvas
        if (b.undo_pending && b.undo_diff) {
          lines.push('╔══════════════════════════════════════════════════╗');
          lines.push('║  ROLLBACK NOTICE — READ BEFORE PROCEEDING        ║');
          lines.push('╚══════════════════════════════════════════════════╝');
          lines.push(`The project map was rolled back to the checkpoint from ${new Date(b.undo_diff.snapshot_time).toLocaleString()}.`);
          lines.push('The following changes were undone:');
          for (const c of b.undo_diff.changes) lines.push(`  ${c}`);
          lines.push('');
          lines.push('ACTION REQUIRED:');
          lines.push('  1. Discard your memory of the undone changes listed above.');
          lines.push('  2. Treat this synapse_context output as the new ground truth.');
          lines.push('  3. Re-evaluate any planned work that depended on the undone changes.');
          lines.push('');
          // Clear the flag so notice only shows once
          b.undo_pending = false;
          b.undo_diff    = undefined;
          write(b);
        }

        // Filter nodes if requested
        const filterType   = a.filter_type   ? String(a.filter_type).toLowerCase()   : null;
        const filterStatus = a.filter_status ? String(a.filter_status).toLowerCase() : null;
        const keyword      = a.keyword       ? String(a.keyword).toLowerCase()       : null;

        let nodes = b.nodes;
        if (filterType)   nodes = nodes.filter(n => n.type === filterType);
        if (filterStatus) nodes = nodes.filter(n => n.status === filterStatus);
        if (keyword)      nodes = nodes.filter(n =>
          n.label.toLowerCase().includes(keyword) ||
          n.description.toLowerCase().includes(keyword) ||
          (n.notes ?? '').toLowerCase().includes(keyword)
        );

        const isFiltered = filterType || filterStatus || keyword;
        const byStatus = (s: string) => b.nodes.filter(n => n.status === s);

        lines.push(`# Project Blueprint: ${b.project}`);
        lines.push(`Updated: ${new Date(b.updated_at).toLocaleString()}`);
        if (b.last_checkpoint) lines.push(`Last checkpoint: ${new Date(b.last_checkpoint).toLocaleString()}`);
        lines.push(`Total: ${b.nodes.length} nodes, ${b.edges.length} connections`);
        if (isFiltered) lines.push(`Filter applied — showing ${nodes.length} of ${b.nodes.length} nodes`);
        lines.push('');
        lines.push('## Status Summary');
        lines.push(`  planned:     ${byStatus('planned').length}`);
        lines.push(`  in-progress: ${byStatus('in-progress').length}`);
        lines.push(`  done:        ${byStatus('done').length}`);
        lines.push(`  blocked:     ${byStatus('blocked').length}`);
        lines.push('', '## Nodes');

        for (const node of nodes) {
          const inc = b.edges.filter(e => e.target === node.id)
            .map(e => { const s = b.nodes.find(n => n.id === e.source); return s ? `${s.label}${e.label ? ' ['+e.label+']' : ''}` : e.source; });
          const out = b.edges.filter(e => e.source === node.id)
            .map(e => { const t = b.nodes.find(n => n.id === e.target); return t ? `${t.label}${e.label ? ' ['+e.label+']' : ''}` : e.target; });
          const pri     = node.priority     ? `  priority: ${node.priority}` : '';
          const userTag = node.source === 'user' ? '  [USER]' : '';
          lines.push(`### [${node.type}] ${node.label}  (${node.status})${userTag}  ID: ${node.id}${pri}`);
          if (node.file_path) lines.push(`File: ${node.file_path}`);
          lines.push(node.description);
          if (node.notes) lines.push(`Notes: ${node.notes}`);
          if (inc.length) lines.push(`← from: ${inc.join(', ')}`);
          if (out.length) lines.push(`→ to:   ${out.join(', ')}`);
          lines.push('');
        }

        // Recent changelog (last 5 entries)
        const logPath = path.join(STORAGE_DIR, 'changelog.json');
        if (fs.existsSync(logPath)) {
          try {
            const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
            const recent = (log.entries ?? []).slice(-5);
            if (recent.length) {
              lines.push('## Recent Activity');
              for (const e of recent) {
                lines.push(`  [${new Date(e.time).toLocaleString()}] ${e.action}: ${e.label}${e.details ? ' — ' + e.details : ''}`);
              }
            }
          } catch {}
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // ── synapse_add_node ───────────────────────────────────────────────────
      case 'synapse_add_node': {
        const b = read();
        const col = b.nodes.length % 4;
        const row = Math.floor(b.nodes.length / 4);
        const node: BlueprintNode = {
          id: uuidv4(), label: String(a.label),
          type:     (a.type     as any) ?? 'component',
          status:   (a.status   as any) ?? 'planned',
          priority: (a.priority as any) ?? undefined,
          source:   'llm',
          description: String(a.description ?? ''),
          notes:     a.notes     ? String(a.notes)     : undefined,
          file_path: a.file_path ? String(a.file_path) : undefined,
          position: {
            x: typeof a.position_x === 'number' ? a.position_x : 100 + col * 280,
            y: typeof a.position_y === 'number' ? a.position_y : 80  + row * 200,
          },
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        b.nodes.push(node);
        write(b);
        appendChangelog('added', node.label, `${node.type}, ${node.status}`);
        return { content: [{ type: 'text', text: `Node added: ${node.label} (ID: ${node.id})` }] };
      }

      // ── synapse_update_node ────────────────────────────────────────────────
      case 'synapse_update_node': {
        const b = read();
        const idx = b.nodes.findIndex(n => n.id === String(a.id));
        if (idx === -1) return { content: [{ type: 'text', text: `Node ${a.id} not found` }] };
        const before = b.nodes[idx];
        const isUserNode = before.source === 'user';
        if (isUserNode && !a.confirmed) {
          return { content: [{ type: 'text', text:
            `PROTECTED: "${before.label}" is a user-created node.\n` +
            `You must confirm with the user before modifying it.\n` +
            `Once you have explicit permission, call synapse_update_node again with confirmed: true.`
          }] };
        }
        const fields: Partial<BlueprintNode> = {};
        if (a.label       !== undefined) fields.label       = String(a.label);
        if (a.type        !== undefined) fields.type        = a.type        as any;
        if (a.status      !== undefined) fields.status      = a.status      as any;
        if (a.priority    !== undefined) fields.priority    = a.priority    as any;
        if (a.description !== undefined) fields.description = String(a.description);
        if (a.notes       !== undefined) fields.notes       = String(a.notes);
        if (a.file_path   !== undefined) fields.file_path   = String(a.file_path);
        b.nodes[idx] = { ...before, ...fields, updated_at: new Date().toISOString() };
        write(b);
        const changes: string[] = [];
        if (fields.status   && fields.status   !== before.status)   changes.push(`status: ${before.status} → ${fields.status}`);
        if (fields.type     && fields.type     !== before.type)     changes.push(`type: ${before.type} → ${fields.type}`);
        if (fields.label    && fields.label    !== before.label)    changes.push(`label: "${before.label}" → "${fields.label}"`);
        if (fields.priority && fields.priority !== before.priority) changes.push(`priority: ${before.priority ?? 'none'} → ${fields.priority}`);
        appendChangelog('updated', b.nodes[idx].label, changes.length ? changes.join(', ') : 'fields updated');
        return { content: [{ type: 'text', text: `Updated: ${b.nodes[idx].label}` }] };
      }

      // ── synapse_link ───────────────────────────────────────────────────────
      case 'synapse_link': {
        const b = read();
        if (b.edges.find(e => e.source === a.source_id && e.target === a.target_id))
          return { content: [{ type: 'text', text: 'Edge already exists' }] };
        const src = b.nodes.find(n => n.id === a.source_id);
        const tgt = b.nodes.find(n => n.id === a.target_id);
        if (!src || !tgt) return { content: [{ type: 'text', text: 'Node(s) not found' }] };
        b.edges.push({ id: uuidv4(), source: String(a.source_id), target: String(a.target_id), label: a.label ? String(a.label) : undefined });
        write(b);
        return { content: [{ type: 'text', text: `Linked: ${src.label} → ${tgt.label}` }] };
      }

      // ── synapse_remove_node ────────────────────────────────────────────────
      case 'synapse_remove_node': {
        const b = read();
        const node = b.nodes.find(n => n.id === a.id);
        if (!node) return { content: [{ type: 'text', text: 'Node not found' }] };
        if (node.source === 'user' && !a.confirmed) {
          return { content: [{ type: 'text', text:
            `PROTECTED: "${node.label}" is a user-created node and cannot be removed without explicit user permission.\n` +
            `Ask the user if they want this node removed. If they confirm, call synapse_remove_node again with confirmed: true.`
          }] };
        }
        b.nodes = b.nodes.filter(n => n.id !== a.id);
        b.edges = b.edges.filter(e => e.source !== a.id && e.target !== a.id);
        write(b);
        appendChangelog('removed', node.label, `${node.type}${a.reason ? ' — ' + a.reason : ''}`);
        return { content: [{ type: 'text', text: `Removed: ${node.label}${a.reason ? ' — ' + a.reason : ''}` }] };
      }

      // ── synapse_set_project ────────────────────────────────────────────────
      case 'synapse_set_project': {
        const b = read();
        b.project = String(a.project_name);
        write(b);
        return { content: [{ type: 'text', text: `Project set to: ${b.project}` }] };
      }

      // ── synapse_checkpoint ─────────────────────────────────────────────────
      case 'synapse_checkpoint': {
        const b    = read();
        const slot = getNextSnapshotSlot();
        const time = new Date().toISOString();
        const label = a.label ? String(a.label) : undefined;
        fs.writeFileSync(
          path.join(STORAGE_DIR, `snapshot-${slot}.json`),
          JSON.stringify({ ...b, _snapshot_time: time, _snapshot_label: label }, null, 2),
          'utf-8'
        );
        // Write last_checkpoint to blueprint to trigger fs.watch on the canvas
        b.last_checkpoint = time;
        write(b);
        appendChangelog('checkpoint', label ?? 'Checkpoint saved', `slot ${slot}`);
        return { content: [{ type: 'text', text: `Checkpoint saved at ${new Date(time).toLocaleString()} (slot ${slot})${label ? ' — ' + label : ''}` }] };
      }

      // ── synapse_changelog ──────────────────────────────────────────────────
      case 'synapse_changelog': {
        const logPath = path.join(STORAGE_DIR, 'changelog.json');
        if (!fs.existsSync(logPath))
          return { content: [{ type: 'text', text: 'No changelog found.' }] };
        const log   = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        const count = typeof a.count === 'number' ? a.count : 20;
        const recent = (log.entries ?? []).slice(-count);
        if (!recent.length) return { content: [{ type: 'text', text: 'No entries yet.' }] };
        const lines = recent.map((e: any) =>
          `[${new Date(e.time).toLocaleString()}] ${e.action}: ${e.label}${e.details ? ' — ' + e.details : ''}`
        );
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // ── synapse_impact ─────────────────────────────────────────────────────
      case 'synapse_impact': {
        const b = read();
        const nodeId = String(a.node_id);
        const startNode = b.nodes.find(n => n.id === nodeId);
        if (!startNode) return { content: [{ type: 'text', text: `Node ${nodeId} not found` }] };

        // BFS downstream (outgoing edges: this node → others)
        const downVisited = new Set<string>([nodeId]);
        const downQueue: Array<{ id: string; hop: number }> =
          b.edges.filter(e => e.source === nodeId).map(e => ({ id: e.target, hop: 1 }));
        const downstream: Array<{ node: BlueprintNode; hop: number }> = [];
        while (downQueue.length) {
          const { id, hop } = downQueue.shift()!;
          if (downVisited.has(id) || hop > 5) continue;
          downVisited.add(id);
          const node = b.nodes.find(n => n.id === id);
          if (node) downstream.push({ node, hop });
          b.edges.filter(e => e.source === id && !downVisited.has(e.target))
            .forEach(e => downQueue.push({ id: e.target, hop: hop + 1 }));
        }

        // BFS upstream (incoming edges: others → this node)
        const upVisited = new Set<string>([nodeId]);
        const upQueue: Array<{ id: string; hop: number }> =
          b.edges.filter(e => e.target === nodeId).map(e => ({ id: e.source, hop: 1 }));
        const upstream: Array<{ node: BlueprintNode; hop: number }> = [];
        while (upQueue.length) {
          const { id, hop } = upQueue.shift()!;
          if (upVisited.has(id) || hop > 5) continue;
          upVisited.add(id);
          const node = b.nodes.find(n => n.id === id);
          if (node) upstream.push({ node, hop });
          b.edges.filter(e => e.target === id && !upVisited.has(e.source))
            .forEach(e => upQueue.push({ id: e.source, hop: hop + 1 }));
        }

        const total = upstream.length + downstream.length;
        const lines = [
          `# Impact Analysis: ${startNode.label}`,
          `[${startNode.type}] ${startNode.status}${startNode.file_path ? ' — ' + startNode.file_path : ''}`,
          `${total} connected node(s)`,
          '',
        ];
        if (upstream.length) {
          lines.push('## ← Upstream (these nodes point to this one)');
          for (const { node, hop } of upstream.sort((a, b) => a.hop - b.hop)) {
            const pri = node.priority ? ` [${node.priority}]` : '';
            lines.push(`  hop ${hop}: [${node.type}] ${node.label} (${node.status}${pri})${node.file_path ? ' — ' + node.file_path : ''}  ID: ${node.id}`);
          }
          lines.push('');
        }
        if (downstream.length) {
          lines.push('## → Downstream (this node points to these)');
          for (const { node, hop } of downstream.sort((a, b) => a.hop - b.hop)) {
            const pri = node.priority ? ` [${node.priority}]` : '';
            lines.push(`  hop ${hop}: [${node.type}] ${node.label} (${node.status}${pri})${node.file_path ? ' — ' + node.file_path : ''}  ID: ${node.id}`);
          }
          lines.push('');
        }
        if (total === 0) {
          lines.push('This node has no connections — it is isolated in the graph.');
        } else {
          lines.push(`Before modifying "${startNode.label}", review all ${total} connected node(s) above.`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // ── synapse_validate ───────────────────────────────────────────────────
      case 'synapse_validate': {
        const b = read();
        const withPaths = b.nodes.filter(n => n.file_path);
        const stale: BlueprintNode[] = [];
        const ok: BlueprintNode[] = [];
        for (const node of withPaths) {
          const fullPath = path.isAbsolute(node.file_path!)
            ? node.file_path!
            : path.join(WORKSPACE_ROOT, node.file_path!);
          (fs.existsSync(fullPath) ? ok : stale).push(node);
        }
        const unanchored = b.nodes.filter(n =>
          !n.file_path && ['component', 'todo', 'problem'].includes(n.type)
        );
        const lines = [
          `# Map Validation: ${b.project}`,
          `${b.nodes.length} total nodes · ${withPaths.length} with file_path · ${b.nodes.length - withPaths.length} without`,
          '',
        ];
        if (stale.length) {
          lines.push(`## Stale file paths (${stale.length})`);
          lines.push('These nodes reference files that no longer exist:');
          for (const node of stale)
            lines.push(`  [${node.type}] ${node.label} — ${node.file_path}  ID: ${node.id}`);
          lines.push('');
          lines.push('ACTION: Update or clear file_path for each stale node via synapse_update_node.');
          lines.push('');
        }
        if (unanchored.length) {
          lines.push(`## Unanchored nodes (${unanchored.length})`);
          lines.push('Component/todo/problem nodes with no file_path — consider adding one:');
          for (const node of unanchored.slice(0, 10))
            lines.push(`  [${node.type}] ${node.label}  ID: ${node.id}`);
          if (unanchored.length > 10) lines.push(`  … and ${unanchored.length - 10} more`);
          lines.push('');
        }
        if (!stale.length && ok.length)
          lines.push(`All ${ok.length} file path(s) verified against ${WORKSPACE_ROOT}`);
        if (!stale.length && !unanchored.length && !ok.length)
          lines.push('No nodes have file_path set yet.');
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(console.error);
