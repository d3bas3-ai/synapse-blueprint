import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface DetectedLLM {
  id: string;
  name: string;
}

// ── LLM detection ─────────────────────────────────────────────────────────────
const KNOWN_LLMS: { extensionIds: string[]; id: string; name: string }[] = [
  { id: 'claude',   name: 'Anthropic',        extensionIds: ['anthropic.claude-code'] },
  { id: 'copilot',  name: 'GitHub Copilot',  extensionIds: ['github.copilot', 'github.copilot-chat'] },
  { id: 'continue', name: 'Continue',         extensionIds: ['continue.continue'] },
  { id: 'cline',    name: 'Cline',            extensionIds: ['saoudrizwan.claude-dev'] },
  { id: 'roo',      name: 'Roo Code',         extensionIds: ['rooveterinaryinc.roo-cline'] },
];

export function detectLLMs(): DetectedLLM[] {
  const found: DetectedLLM[] = [];
  for (const llm of KNOWN_LLMS) {
    const installed = llm.extensionIds.some(id => !!vscode.extensions.getExtension(id));
    if (installed) found.push({ id: llm.id, name: llm.name });
  }
  return found;
}

// ── Instruction block (same 11 rules, LLM-agnostic) ─────────────────────────
const MARKER_START = '<!-- synapse:start -->';
const MARKER_END   = '<!-- synapse:end -->';

function buildInstructionBlock(projectName: string): string {
  return [
    MARKER_START,
    '',
    '## Synapse Blueprint',
    '',
    `This project uses Synapse Blueprint for context tracking. The Synapse MCP server`,
    `injects full session rules and instructions automatically at connection time.`,
    '',
    `If the Synapse MCP server is not connected, run **Synapse: Setup Walkthrough**`,
    `from the VS Code command palette (Ctrl+Shift+P) to configure it.`,
    '',
    MARKER_END,
  ].join('\n');
}

function writeInstructionFile(filePath: string, projectName: string, header: string) {
  const block = buildInstructionBlock(projectName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${header}\n\n${block}\n`, 'utf-8');
    return;
  }
  const existing = fs.readFileSync(filePath, 'utf-8');
  if (existing.includes(MARKER_START)) {
    const updated = existing.replace(
      new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`), block
    );
    if (updated !== existing) fs.writeFileSync(filePath, updated, 'utf-8');
    return;
  }
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(filePath, existing + sep + block + '\n', 'utf-8');
}

// ── Per-LLM MCP config writers ────────────────────────────────────────────────
function nodePath(): string {
  // Rely on PATH resolution in the MCP client process.
  // process.execPath in the VS Code extension host points to the Electron binary, not Node.
  return 'node';
}

function mcpServerEntry(mcpServerPath: string, blueprintPath: string, workspaceRoot: string) {
  return {
    command: nodePath(),
    args: [mcpServerPath],
    env: { BLUEPRINT_PATH: blueprintPath, WORKSPACE_ROOT: workspaceRoot },
  };
}

function writeJsonFile(filePath: string, updater: (cfg: any) => any) {
  let cfg: any = {};
  if (fs.existsSync(filePath)) {
    try { cfg = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch {}
  }
  const updated = updater(cfg);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
}

// Anthropic — .mcp.json in project root
function configureAnthropicCode(projectRoot: string, mcpServerPath: string, blueprintPath: string, projectName: string) {
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');
  writeJsonFile(mcpJsonPath, (cfg) => {
    if (!cfg.mcpServers) cfg.mcpServers = {};
    cfg.mcpServers.synapse = mcpServerEntry(mcpServerPath, blueprintPath, projectRoot);
    return cfg;
  });
  writeInstructionFile(path.join(projectRoot, 'CLAUDE.md'), projectName, `# ${projectName}`);
}

// GitHub Copilot — .vscode/mcp.json (VS Code 1.99+ native MCP)
function configureCopilot(projectRoot: string, mcpServerPath: string, blueprintPath: string, projectName: string) {
  const vscodeDir = path.join(projectRoot, '.vscode');
  writeJsonFile(path.join(vscodeDir, 'mcp.json'), (cfg) => {
    if (!cfg.servers) cfg.servers = {};
    cfg.servers.synapse = mcpServerEntry(mcpServerPath, blueprintPath, projectRoot);
    return cfg;
  });
  writeInstructionFile(
    path.join(projectRoot, '.github', 'copilot-instructions.md'),
    projectName, `# ${projectName} — Copilot Instructions`
  );
}

// Continue — .continue/config.json mcpServers entry
function configureContinue(projectRoot: string, mcpServerPath: string, blueprintPath: string, projectName: string) {
  const cfgPath = path.join(projectRoot, '.continue', 'config.json');
  writeJsonFile(cfgPath, (cfg) => {
    if (!cfg.mcpServers) cfg.mcpServers = [];
    const idx = cfg.mcpServers.findIndex((s: any) => s.name === 'synapse');
    const entry = { name: 'synapse', ...mcpServerEntry(mcpServerPath, blueprintPath, projectRoot) };
    if (idx === -1) cfg.mcpServers.push(entry);
    else cfg.mcpServers[idx] = entry;
    return cfg;
  });
  writeInstructionFile(path.join(projectRoot, '.continuerules'), projectName, `# ${projectName}`);
}

// Cline / Roo Code — .clinerules instruction file + .mcp.json
function configureCline(projectRoot: string, mcpServerPath: string, blueprintPath: string, projectName: string) {
  // Cline reads .mcp.json from project root
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');
  writeJsonFile(mcpJsonPath, (cfg) => {
    if (!cfg.mcpServers) cfg.mcpServers = {};
    cfg.mcpServers.synapse = mcpServerEntry(mcpServerPath, blueprintPath, projectRoot);
    return cfg;
  });
  writeInstructionFile(path.join(projectRoot, '.clinerules'), projectName, `# ${projectName}`);
}

// ── Main entry ────────────────────────────────────────────────────────────────
export function configureLLMs(
  detectedLLMs: DetectedLLM[],
  projectRoot: string,
  mcpServerPath: string,
  blueprintPath: string,
  projectName: string,
) {
  try {
    for (const llm of detectedLLMs) {
      switch (llm.id) {
        case 'claude':   configureAnthropicCode(projectRoot, mcpServerPath, blueprintPath, projectName); break;
        case 'copilot':  configureCopilot(projectRoot, mcpServerPath, blueprintPath, projectName); break;
        case 'continue': configureContinue(projectRoot, mcpServerPath, blueprintPath, projectName); break;
        case 'cline':
        case 'roo':      configureCline(projectRoot, mcpServerPath, blueprintPath, projectName); break;
      }
    }
  } catch (err: any) {
    console.error('Blueprint: could not write LLM config —', err.message);
  }
}

export function allSupportedLLMs() {
  return KNOWN_LLMS.map(l => ({ id: l.id, name: l.name }));
}
