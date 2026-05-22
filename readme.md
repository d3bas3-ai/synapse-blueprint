# Synapse Blueprint

**A live project node map that keeps your LLM honest across long sessions.**

Synapse maintains a persistent graph of your project — every component, feature, decision, dependency, todo, and problem — stored privately in VS Code workspace storage. Your LLM reads the map at the start of every session and updates it as it works. Context never silently drifts. Connections are never forgotten. Destructive changes across multi-session projects become visible before they happen.

Synapse works with any LLM that supports the Model Context Protocol (MCP). It auto-detects which MCP-capable LLM extensions you have installed and writes the correct configuration automatically. Terminal and CLI agents like Claude Code work identically to sidebar extensions — no special setup beyond the MCP config.

---

## Why Synapse

LLMs degrade across long coding sessions and across multiple sessions. They lose track of what files exist, what each component does, what was decided and why, and what was left incomplete. They make changes that break things they have never looked at. Synapse is the guardrail that closes that gap.

Every node carries a stable `#N` reference number that never changes — so you can say "look at node 12" and the LLM finds exactly the right one, no matter how many layout changes or cleanup operations have happened. Before touching any file, the LLM calls `synapse_impact` and sees the full blast radius. If it edits files without updating the map, the next `synapse_context` call raises a visible drift warning. If it makes a destructive mistake, a 5-slot checkpoint ring means you have up to five rollback points to reach.

---

## Features

### Map and Canvas
- **Interactive graph canvas** — React Flow with animated directed edges, drag-to-connect, and click-to-open node cards
- **Four layout modes** — Tree Down, Tree Right, Radial, Grid — all dagre-based or BFS-computed
- **Stable `#N` node IDs** — every node gets a permanent creation-order number displayed on the canvas tile, in the node card, in the legend, and in all MCP tool output; survives deletes, reorders, and layout changes
- **Live sync** — LLM and canvas read/write the same file; changes from either side appear instantly without refresh
- **Private storage** — blueprint lives in VS Code workspace storage, invisible to git and file explorers

### Node Cards and Editing
- **Full in-canvas editing** — edit label, type, status, priority, description, notes, and file path directly from the node card without leaving the canvas
- **Editable file path** — click to edit inline; the anchor between a node and its actual file in the codebase
- **Edge management** — view all incoming and outgoing connections; click any connected node to jump to it; remove edges with two-step confirmation to prevent mis-clicks
- **Edit conflict protection** — if your LLM updates a node while you are mid-edit in the card, your in-progress text is preserved

### LLM Protection
- **User-created node protection** — nodes you add from the canvas carry an amber `U` badge; LLMs must ask permission before modifying them and cannot remove them without `confirmed: true`
- **Impact analysis** — `synapse_impact` traces the full upstream and downstream blast radius of any change, grouped by hop distance, before the LLM writes a single line
- **Drift detection** — workspace file changes are watched in real time; if files changed since the LLM last updated the map, the next `synapse_context` call shows a boxed warning
- **5-slot checkpoint rollback** — up to five named snapshots; ask your LLM to roll back to any of them from the canvas

### Tooling
- **11 MCP tools** — summary, context, add, update, link, remove, checkpoint, changelog, set project, impact analysis, map validation
- **LLM-agnostic** — auto-configures Anthropic Claude (Claude Code), GitHub Copilot, Continue, Cline, Roo Code, and more
- **Compact summary** — `synapse_summary` gives a one-line-per-node map overview at a fraction of the token cost of the full context
- **Map validation** — `synapse_validate` checks every `file_path` against the real filesystem and reports stale and unanchored nodes
- **500-entry changelog** — every add, update, and remove is logged; accessible via `synapse_changelog`

### Canvas UI
- **Status bar** — live counts of done / in-progress / planned nodes at a glance
- **Legend navigator** — click any type chip to browse and jump to nodes of that type; scroll with the mouse wheel; includes `#N`, priority dot, user badge, and status
- **Pannable, zoomable minimap** — click anywhere on the minimap to jump the canvas instantly; node colours match their type
- **Minimap toggle** — collapse or restore the minimap and zoom controls with one click
- **Checkpoint badge** — amber `↩` indicator in the toolbar shows the latest checkpoint time; dim when none exists
- **Export / Import** — back up or restore the full blueprint as JSON; import auto-saves a checkpoint first
- **3-state autosave indicator** — `saving…` → `Saved` → `HH:MM` last save time
- **Built-in VS Code walkthrough** — step-by-step LLM setup guide

---

## Supported LLMs

Synapse works with any LLM client that supports the Model Context Protocol (MCP) over stdio. On first open it auto-detects installed LLM extensions and writes the correct config files automatically.

Tested and auto-configured:
- Claude Code (Anthropic CLI — terminal)
- GitHub Copilot
- Continue
- Cline
- Roo Code

If your LLM is not detected, run **Synapse: Setup Walkthrough** (`Ctrl+Shift+Alt+S`) or follow the [Manual LLM Setup](#manual-llm-setup) section below. Any LLM client that can connect to an MCP stdio server will work.

### Terminal and CLI agents

LLMs running in a terminal — such as Claude Code in the VS Code integrated terminal — work identically to sidebar extensions. No extra setup beyond the MCP config. Open your project in VS Code, start your terminal agent, and ask it to call `synapse_context`. It will read the full blueprint and begin using it immediately.

---

## How It Works

On first open of a new project, Synapse shows a one-time setup prompt listing exactly what it will create. After confirmation it:

1. Writes an MCP config file pointing to the Synapse MCP server
2. Writes a minimal instruction file telling the LLM the server is available
3. Opens the canvas

When the LLM connects to the Synapse MCP server, the server injects the full session ruleset directly into the LLM's context at the MCP `initialize` handshake — 21 numbered rules covering session start order, mandatory impact checks before file edits, map update requirements after file edits, checkpoint rules before closing work, user node protection, and closing node procedure. The rules travel with the extension and are always current with the installed version. No project-side maintenance required.

On every subsequent open, Synapse silently keeps the MCP config current. If a project is already managed by another MCP extension, Synapse detects this and stays silent.

---

## Canvas UI

### Toolbar

| Control | Description |
|---|---|
| Project name | Current project name and live node / edge counts |
| `+ Add Node` | Opens the Add Node panel (creates a user-protected node) |
| Layout ▾ | Switch layout mode — Tree Down, Tree Right, Radial, Grid |
| `↑ Export` | Save the full blueprint JSON to disk |
| `↓ Import` | Load a blueprint JSON from disk — auto-saves a checkpoint first |
| `↩` Checkpoint badge | Amber with time when a checkpoint exists, dim when none — ask your LLM to roll back |
| Autosave indicator | `saving…` while writing, `Saved`, then `HH:MM` last save time |

### Layout Modes

| Mode | Algorithm | Description |
|---|---|---|
| Tree Down | dagre TB | Hierarchical, top to bottom |
| Tree Right | dagre LR | Hierarchical, left to right |
| Radial | BFS layers | Roots at centre, each layer on an expanding ring |
| Grid | Sort + pack | Sorted by type then label, packed near-square |

Applying a layout saves all node positions immediately. On reload, saved positions are restored exactly. Only brand-new nodes that have never been positioned are auto-placed.

### Node Cards

Click any node to open its detail panel on the right. From there you can:

- **Edit** label, type, status, priority, description, notes, and file path — all inline
- **View connections** — incoming and outgoing edges listed with the connected node label; click any to jump the canvas to that node
- **Remove edges** — two-step confirmation prevents accidental removal
- **Remove node** — confirmation dialog with node name
- **`#N` reference** — stable sequence number shown next to the label; use it to reference the node in conversation without ambiguity

### Legend Navigator (bottom-left)

Nine colour-coded type chips stacked vertically, each with a count badge. Click any chip to open the navigator panel above it, showing up to five nodes of that type with:

- Priority-coloured dot (grey if none)
- `#N` stable ID
- Node label
- User badge `U` if user-created
- Status text and symbol

Scroll with the mouse wheel. Click any row to pan the canvas to that node and open its card.

---

## Node Types

| Type | Colour | Use for |
|---|---|---|
| `feature` | Green | User-facing capabilities |
| `component` | Blue | Internal files, modules, services written in this project |
| `decision` | Purple | Architectural or design choices with rationale |
| `dependency` | Amber | External packages, APIs, cloud services |
| `research` | Cyan | Open questions needing investigation before a decision |
| `todo` | Grey | Pending tasks and action items |
| `done` | Dark green | Completed items kept for traceability |
| `problem` | Red | Known bugs, blockers, or design flaws |
| `note` | Orange | Reference context that fits nowhere else |

### Node Status

| Status | Canvas opacity | Symbol |
|---|---|---|
| `planned` | 50% | ○ |
| `in-progress` | 100% | ⟳ |
| `done` | 60% | ✓ |
| `blocked` | 80% | ✗ |

### Node Priority

| Priority | Colour | Displayed as |
|---|---|---|
| `high` | Red | Dot on canvas tile · pill in node card · coloured row dot in legend |
| `medium` | Amber | Same |
| `low` | Green | Same |

Set from the Add Node panel, the node card, or via `synapse_update_node`.

### User-Created Nodes

Nodes added from the canvas Add Node panel are automatically tagged `source: 'user'`. They are visually distinct at every level and are protected from LLM modification:

| Location | Indicator |
|---|---|
| Canvas tile | Amber `U` badge, top-left corner |
| Node card header | Amber `U user` pill |
| Legend navigator rows | Amber `U` badge after the label |
| MCP `synapse_context` | `[USER]` tag |
| MCP `synapse_summary` | `[U]` tag |

The LLM must ask explicit permission before modifying a user node (`confirmed: true` required). Removal without `confirmed: true` is hard-blocked at the tool level. Permission is task-scoped and resets on each new task.

---

## MCP Tools Reference

Eleven tools registered under server name `synapse`.

### `synapse_summary`

Compact one-line-per-node overview of the entire project. Shows type, `#N`, label, user tag, status, priority, and edge connections. Call this first — much lower token cost than `synapse_context`.

```
No required parameters.
```

---

### `synapse_context`

Full project blueprint with all node details, connections, status summary, last five changelog entries, and any pending rollback notice. If workspace files changed since the last map update, a **drift warning** is injected at the top of the response.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filter_type` | string | no | Only return nodes of this type |
| `filter_status` | string | no | Only return nodes with this status |
| `keyword` | string | no | Only return nodes whose label, description, or notes contain this string |

---

### `synapse_add_node`

Adds a new node and assigns it the next stable `#N` sequence number.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `label` | string | yes | Short name |
| `type` | string | yes | One of the nine node types |
| `description` | string | yes | What it is, why it exists |
| `status` | string | no | `planned` (default), `in-progress`, `done`, `blocked` |
| `priority` | string | no | `high`, `medium`, `low` |
| `notes` | string | no | Scratch pad, open questions, findings |
| `file_path` | string | no | Path to the file this node represents |
| `position_x` | number | no | Canvas X (auto-assigned if omitted) |
| `position_y` | number | no | Canvas Y (auto-assigned if omitted) |

---

### `synapse_update_node`

Updates an existing node by ID. Only provided fields are changed.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Node UUID from `synapse_context` |
| `label` | string | no | New label |
| `type` | string | no | New type |
| `status` | string | no | New status |
| `priority` | string | no | `high`, `medium`, `low` — omit to clear |
| `description` | string | no | Updated description |
| `notes` | string | no | Updated notes |
| `file_path` | string | no | Updated file path |
| `confirmed` | boolean | no | Required `true` to modify a user-created node after explicit user permission |

---

### `synapse_link`

Creates a directed edge between two nodes. Duplicate edges are silently ignored.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source_id` | string | yes | ID of the source node |
| `target_id` | string | yes | ID of the target node |
| `label` | string | no | Relationship label — e.g. `depends on`, `calls`, `produces` |

---

### `synapse_remove_node`

Removes a node and all its connected edges.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Node ID to remove |
| `reason` | string | no | Why it was removed (logged to changelog) |
| `confirmed` | boolean | no | Required `true` to remove a user-created node after explicit user permission |

---

### `synapse_impact`

**Call this before modifying any node or its file.** Returns the full upstream and downstream blast radius — every connected node reachable via edges, grouped by hop distance (max 5 hops each direction). Includes file path and priority so the LLM can see what is in-flight vs stable before making changes.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `node_id` | string | yes | ID of the node to analyse |

---

### `synapse_validate`

Checks every `file_path` field across all nodes against the actual workspace filesystem. Reports stale nodes (file deleted or renamed) and unanchored component/todo/problem nodes with no `file_path`. Run after any file renames, deletions, or structural refactors.

```
No required parameters.
```

---

### `synapse_checkpoint`

Saves a named snapshot to the 5-slot ring buffer. The canvas checkpoint badge updates immediately. Up to five rollback points are maintained — the oldest slot is overwritten when all five are full.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `label` | string | no | Human-readable label for this checkpoint |

---

### `synapse_changelog`

Returns recent blueprint change entries. Every add, update, remove, and checkpoint is logged automatically. Up to 500 entries retained.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `count` | number | no | Entries to return (default 20) |

---

### `synapse_set_project`

Sets or renames the project. Updates the canvas title and all MCP session rule headers.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_name` | string | yes | New project name |

---

## Commands

| Command | Shortcut | Description |
|---|---|---|
| Synapse: Open Canvas | `Ctrl+Shift+Y` / `Cmd+Shift+Y` | Open the node map canvas |
| Synapse: Setup Walkthrough | `Ctrl+Shift+Alt+S` / `Cmd+Shift+Alt+S` | Manual LLM setup guide |
| Synapse: Reset Project Map | Command palette only | Clear all nodes and edges after a name prompt — no shortcut by design |

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `synapse.autoOpen` | boolean | `true` | Automatically open the canvas when a project with an existing map is opened |

**File › Preferences › Settings** → search `Synapse`.

---

## Manual LLM Setup

Run **Synapse: Setup Walkthrough** (`Ctrl+Shift+Alt+S`) for guided setup, or configure manually:

### MCP config

Add to your LLM's MCP configuration file:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["/path/to/extension/dist/mcp-server.js"],
      "env": {
        "BLUEPRINT_PATH": "/path/to/storage/blueprint.json",
        "WORKSPACE_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

- `args` — absolute path to `dist/mcp-server.js` inside the Synapse extension install directory
- `BLUEPRINT_PATH` — absolute path to your blueprint JSON (shown in the Setup Walkthrough)
- `WORKSPACE_ROOT` — root of your project folder (used by `synapse_validate` for file path checks)

### Instruction file

Add to your LLM's instruction file (`.clinerules`, `.cursorrules`, `CLAUDE.md`, etc.):

```
This project uses Synapse Blueprint for context tracking. The Synapse MCP server
injects full session rules and instructions automatically at connection time.

If the Synapse MCP server is not connected, run Synapse: Setup Walkthrough
from the VS Code command palette (Ctrl+Shift+P) to configure it.
```

---

## Architecture

Three bundles compiled by `esbuild.js` in a single build step:

| Bundle | Entry | Output | Format | Runtime |
|---|---|---|---|---|
| Extension host | `src/extension.ts` | `dist/extension.js` | CJS | Node 20 |
| MCP server | `src/mcp-server.ts` | `dist/mcp-server.js` | CJS | Node 20 |
| Webview | `webview/src/index.tsx` | `dist/webview.js` | IIFE | Chrome 120 |

### Key source files

```
src/
  extension.ts        VS Code activation, LLM detection, command registration
  BlueprintStore.ts   Read/write blueprint JSON, 5-slot snapshots, changelog,
                      diff caching, fs.watch, seq backfill
  BlueprintPanel.ts   WebviewPanel lifecycle, message routing, export/import
  llm-config.ts       Per-LLM MCP config and instruction file writers
  mcp-server.ts       MCP stdio server — 11 synapse_* tools, session rules,
                      drift detection via fs.watch on workspace
  types.ts            Shared TypeScript types

webview/src/
  App.tsx             Canvas, toolbar, layout engine, legend navigator, autosave
  NodeCard.tsx        Node detail/edit panel, edge confirm, edit conflict protection
  AddNodePanel.tsx    Add-node form with priority selector
  constants.ts        Shared colour maps (TYPE_COLORS, PRIORITY_COLORS, STATUS_COLORS)
```

### Data flow

```
LLM (MCP tools)
  ↕ reads/writes blueprint.json
BlueprintStore (fs.watch on blueprint.json)
  → fires onChange / onSave
BlueprintPanel
  ↕ postMessage to/from webview
React canvas (App.tsx)
```

The MCP server and extension host access the same `blueprint.json`. `fs.watch` on that file keeps the canvas live-synced with no manual refresh. The MCP server additionally watches `WORKSPACE_ROOT` for source file changes to power the drift detection signal.

---

## Building from Source

**Prerequisites:** Node.js 20+, npm

```bash
npm install
npm run build       # compile all three bundles
npm run watch       # rebuild on file save
npm run package     # build + package → synapse-1.0.0.vsix
```

### Install

```bash
code --install-extension synapse-1.0.0.vsix --force
```

Reload VS Code after installation (`Ctrl+Shift+P` → **Developer: Reload Window**).

---

## Blueprint JSON Format

The blueprint is a plain JSON file stored in VS Code workspace storage. You can inspect, back up, and hand-edit it at any time.

```jsonc
{
  "version": "1.0",
  "project": "My Project",
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T12:00:00.000Z",
  "nextSeq": 8,
  "nodes": [
    {
      "id": "uuid-v4",
      "seq": 1,
      "label": "Auth Service",
      "type": "component",
      "status": "in-progress",
      "priority": "high",
      "source": "llm",
      "description": "Handles JWT issuance and validation",
      "notes": "Switch to RS256 before production",
      "file_path": "src/auth/service.ts",
      "position": { "x": 100, "y": 80 },
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "edges": [
    {
      "id": "uuid-v4",
      "source": "node-id-a",
      "target": "node-id-b",
      "label": "depends on"
    }
  ]
}
```

Use **Export** on the canvas toolbar to save a copy. Use **Import** to restore one — a checkpoint is saved automatically before any import.

---

## License

Synapse Blueprint is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

- Free for personal use, open source projects, and non-commercial work
- Not permitted for commercial use — including selling, sublicensing, or incorporating into paid products or services — without written permission from the author

See the [LICENSE](LICENSE) file for full terms, or visit [creativecommons.org/licenses/by-nc/4.0](https://creativecommons.org/licenses/by-nc/4.0/).

---

## Support

Synapse Blueprint is free and built by an independent developer. If it saves you time and you would like to say thanks, a small donation is always appreciated.

No pressure. Enjoying the extension is enough.
