================================================================================
 SYNAPSE BLUEPRINT  —  VS Code Extension  —  v1.0.0
================================================================================

A live project node map that keeps your LLM honest across long sessions.

Synapse maintains a persistent graph of your project — every component,
feature, decision, dependency, todo, and problem — stored privately in VS Code
workspace storage. Your LLM reads the map at the start of every session and
updates it as it works. Context never silently drifts. Connections are never
forgotten. Destructive changes across multi-session projects become visible
before they happen.

Synapse works with any LLM that supports MCP. It auto-detects which MCP-capable
LLM extensions you have installed and writes the correct configuration
automatically. Terminal and CLI agents like Claude Code work identically to
sidebar extensions — no special setup beyond the MCP config.


--------------------------------------------------------------------------------
 WHY SYNAPSE
--------------------------------------------------------------------------------

  LLMs degrade across long coding sessions and across multiple sessions. They
  lose track of what files exist, what each component does, what was decided and
  why, and what was left incomplete. They make changes that break things they
  have never looked at. Synapse is the guardrail that closes that gap.

  Every node carries a stable #N reference number that never changes — so you
  can say "look at node 12" and the LLM finds exactly the right one. Before
  touching any file, the LLM calls synapse_impact and sees the full blast
  radius. If it edits files without updating the map, the next synapse_context
  call raises a visible drift warning. If it makes a destructive mistake, a
  5-slot checkpoint ring means you have up to five rollback points to reach.


--------------------------------------------------------------------------------
 FEATURES
--------------------------------------------------------------------------------

  MAP AND CANVAS
  - Interactive graph canvas with animated directed edges
  - Four layout modes: Tree Down, Tree Right, Radial, Grid
  - Stable #N node IDs — permanent creation-order numbers on canvas tiles,
    node cards, legend rows, and all MCP output; survive deletes and reorders
  - Live sync — LLM and canvas read/write the same file; changes appear
    instantly without refresh
  - Private storage — blueprint invisible to git and file explorers

  NODE CARDS AND EDITING
  - Full in-canvas editing: label, type, status, priority, description,
    notes, and file path
  - Editable file path — click to edit inline in the node card
  - Edge management with two-step removal confirmation
  - Edit conflict protection — in-progress edits survive external LLM updates

  LLM PROTECTION
  - User-created node protection — amber U badge; LLMs must ask permission
    before modifying or removing
  - Impact analysis — synapse_impact traces full blast radius before any change
  - Drift detection — boxed warning in synapse_context if workspace files
    changed since the LLM last updated the map
  - 5-slot checkpoint rollback — up to five named rollback points

  TOOLING
  - 11 MCP tools: summary, context, add, update, link, remove, checkpoint,
    changelog, set project, impact analysis, map validation
  - LLM-agnostic — auto-configures Claude Code, Copilot, Continue, Cline,
    Roo Code, and more
  - Compact summary tool — synapse_summary for fast low-cost project overview
  - Map validation — synapse_validate checks file paths against the filesystem
  - 500-entry changelog — full audit trail across sessions

  CANVAS UI
  - Status bar with live done / in-progress / planned counts
  - Legend navigator — browse and jump to nodes by type, with #N and priority
  - Pannable zoomable minimap with instant-jump on click
  - Minimap toggle — collapse or restore with one click
  - Checkpoint badge — amber arrow indicator when a rollback is available
  - Export / Import blueprint JSON (import auto-saves a checkpoint first)
  - 3-state autosave indicator
  - Built-in VS Code walkthrough for manual LLM setup


--------------------------------------------------------------------------------
 SUPPORTED LLMs
--------------------------------------------------------------------------------

  Works with any LLM client that supports MCP over stdio. Tested and
  auto-configured: Claude Code, GitHub Copilot, Continue, Cline, Roo Code.

  If your LLM is not detected, run "Synapse: Setup Walkthrough" from the
  command palette, or follow the Manual LLM Setup section below.

  TERMINAL AND CLI AGENTS
  LLMs running in a terminal (e.g. Claude Code) work identically to sidebar
  extensions. No extra setup beyond the MCP config. Open your project, start
  the agent, and ask it to call synapse_context.


--------------------------------------------------------------------------------
 INSTALLATION
--------------------------------------------------------------------------------

  Option 1 - Command palette:
    1. Press Ctrl+Shift+P
    2. Type "Install from VSIX" and press Enter
    3. Select synapse-1.0.0.vsix
    4. Click Reload Window when prompted

  Option 2 - Terminal:
    code --install-extension synapse-1.0.0.vsix --force
    Then: Ctrl+Shift+P > Developer: Reload Window


--------------------------------------------------------------------------------
 HOW IT WORKS
--------------------------------------------------------------------------------

  On first open of a new project, Synapse shows a one-time setup prompt.
  After confirmation it:

    1. Writes an MCP config file pointing to the Synapse MCP server
    2. Writes a minimal instruction file for the LLM
    3. Opens the interactive canvas

  When the LLM connects, the server injects 21 numbered session rules into
  the LLM's context at the MCP initialize handshake. Rules cover session
  start order, mandatory impact checks, map update requirements, checkpoint
  rules, user node protection, and node closing procedure. Rules always match
  the installed extension version — no project-side maintenance required.

  On every subsequent open, Synapse silently keeps the MCP config current.
  If another MCP blueprint extension is detected, Synapse stays silent.


--------------------------------------------------------------------------------
 CANVAS — TOOLBAR
--------------------------------------------------------------------------------

  Project name        Current name and live node/edge counts
  + Add Node          Opens the Add Node panel (creates a user-protected node)
  Layout dropdown     Switch between Tree Down, Tree Right, Radial, Grid
  Export              Save blueprint JSON to disk
  Import              Load blueprint JSON from disk (checkpoint saved first)
  Checkpoint badge    Amber with time when a rollback exists, dim when none
  Autosave indicator  saving... > Saved > HH:MM last save time


--------------------------------------------------------------------------------
 LAYOUT MODES
--------------------------------------------------------------------------------

  Tree Down   Dagre hierarchical, top to bottom
  Tree Right  Dagre hierarchical, left to right
  Radial      BFS layers, roots at centre, each layer on an expanding ring
  Grid        Sorted by type then label, packed near-square

  Applying a layout saves all node positions immediately. On reload, saved
  positions are restored exactly. Only brand-new nodes are auto-placed.


--------------------------------------------------------------------------------
 NODE TYPES
--------------------------------------------------------------------------------

  feature      Green        User-facing capabilities
  component    Blue         Internal files, modules, services in this project
  decision     Purple       Architectural or design choices with rationale
  dependency   Amber        External packages, APIs, cloud services
  research     Cyan         Open questions needing investigation
  todo         Grey         Pending tasks and action items
  done         Dark green   Completed items kept for traceability
  problem      Red          Known bugs, blockers, or design flaws
  note         Orange       Reference context that fits nowhere else


--------------------------------------------------------------------------------
 NODE STATUS
--------------------------------------------------------------------------------

  planned       50% opacity    circle symbol
  in-progress   100% opacity   rotating arrow symbol
  done          60% opacity    checkmark symbol
  blocked       80% opacity    X symbol


--------------------------------------------------------------------------------
 NODE PRIORITY
--------------------------------------------------------------------------------

  high     Red     — dot on canvas, pill in card, coloured row dot in legend
  medium   Amber   — same
  low      Green   — same

  Set from the Add Node panel, node card, or via synapse_update_node.


--------------------------------------------------------------------------------
 USER-CREATED NODES
--------------------------------------------------------------------------------

  Nodes added from the canvas are tagged source:'user' and fully protected.

  Canvas tile        Amber U badge, top-left corner
  Node card          Amber "U user" pill in header
  Legend navigator   Amber U badge after the label
  synapse_context    [USER] tag
  synapse_summary    [U] tag

  The LLM must ask permission before modifying and pass confirmed:true.
  Removal without confirmed:true is hard-blocked at the tool level.
  Protection is task-scoped and resets on each new task.


--------------------------------------------------------------------------------
 MCP TOOLS REFERENCE
--------------------------------------------------------------------------------

  11 tools registered under server name "synapse".

  synapse_summary
    Compact one-line-per-node overview. Shows type, #N, label, user tag,
    status, priority, and edge connections. Call this first at session start.
    No parameters.

  synapse_context
    Full blueprint with all node details, connections, status summary, and
    last five changelog entries. Shows drift warning if workspace files changed
    since the last map update. Shows rollback notice after a restore.
    Optional: filter_type, filter_status, keyword

  synapse_add_node
    Adds a new node. Assigns the next stable #N sequence number.
    Required: label, type, description
    Optional: status, priority, notes, file_path, position_x, position_y

  synapse_update_node
    Updates an existing node by ID. Only provided fields are changed.
    Required: id
    Optional: label, type, status, priority, description, notes, file_path
    Optional: confirmed (boolean) — required true to modify a user node

  synapse_link
    Creates a directed edge between two nodes.
    Required: source_id, target_id
    Optional: label (e.g. "depends on", "calls", "produces")

  synapse_remove_node
    Removes a node and all its edges.
    Required: id
    Optional: reason, confirmed (required true to remove a user node)

  synapse_impact
    MANDATORY before modifying any node or file. Returns the full upstream
    and downstream blast radius grouped by hop distance (max 5 hops each).
    Required: node_id

  synapse_validate
    Checks every file_path against the real workspace filesystem. Reports
    stale paths (file missing) and unanchored component/todo/problem nodes.
    No parameters.

  synapse_checkpoint
    Saves a named snapshot to the 5-slot ring buffer. Canvas badge updates
    immediately. Oldest slot overwritten when all five are full.
    Optional: label

  synapse_changelog
    Returns recent change entries. Up to 500 entries retained.
    Optional: count (default 20)

  synapse_set_project
    Sets or renames the project.
    Required: project_name


--------------------------------------------------------------------------------
 COMMANDS AND KEYBINDINGS
--------------------------------------------------------------------------------

  Synapse: Open Canvas        Ctrl+Shift+Y  (Mac: Cmd+Shift+Y)
  Synapse: Setup Walkthrough  Ctrl+Shift+Alt+S  (Mac: Cmd+Shift+Alt+S)
  Synapse: Reset Project Map  Command palette only — no shortcut by design

  All commands accessible via Ctrl+Shift+P > search "Synapse".


--------------------------------------------------------------------------------
 SETTINGS
--------------------------------------------------------------------------------

  synapse.autoOpen   boolean   default: true

  When true, the canvas opens automatically when a project with an existing
  map is opened. Set false to open manually with Ctrl+Shift+Y.

  File > Preferences > Settings > search "Synapse"


--------------------------------------------------------------------------------
 MANUAL LLM SETUP
--------------------------------------------------------------------------------

  Run "Synapse: Setup Walkthrough" from the command palette for guided setup,
  or add the following to your LLM's MCP configuration file manually:

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

  BLUEPRINT_PATH: path to blueprint.json in VS Code workspace storage
                  (shown in the Setup Walkthrough)
  WORKSPACE_ROOT: root of your project folder (used by synapse_validate)

  Add to your LLM's instruction file (.clinerules, CLAUDE.md, etc.):

    This project uses Synapse Blueprint for context tracking. The Synapse MCP
    server injects full session rules automatically at connection time.
    If not connected, run Synapse: Setup Walkthrough from the command palette.


--------------------------------------------------------------------------------
 ARCHITECTURE
--------------------------------------------------------------------------------

  Three bundles compiled by esbuild.js:

    dist/extension.js    Extension host (CJS, Node 20)
    dist/mcp-server.js   MCP stdio server — 11 tools, drift detection (CJS, Node 20)
    dist/webview.js      React canvas (IIFE, Chrome 120)

  Key source files:

    src/extension.ts       Activation, LLM detection, command registration
    src/BlueprintStore.ts  Read/write blueprint JSON, 5-slot snapshots,
                           changelog, diff caching, seq backfill
    src/BlueprintPanel.ts  WebviewPanel lifecycle, message routing, dialogs
    src/llm-config.ts      Per-LLM MCP config and instruction file writers
    src/mcp-server.ts      MCP server, 11 tools, session rules injection,
                           fs.watch drift detection
    src/types.ts           Shared TypeScript types

    webview/src/App.tsx          Canvas, toolbar, layout, legend, autosave
    webview/src/NodeCard.tsx     Node detail/edit panel
    webview/src/AddNodePanel.tsx Add-node form
    webview/src/constants.ts     Shared colour maps

  Data flow:

    LLM uses MCP tools
        reads/writes blueprint.json
    BlueprintStore watches the file (fs.watch)
        fires onChange and onSave events
    BlueprintPanel routes messages
        postMessage to and from the webview
    React canvas renders the graph


--------------------------------------------------------------------------------
 BUILDING FROM SOURCE
--------------------------------------------------------------------------------

  Prerequisites: Node.js 20+, npm

    npm install
    npm run build       (compile all three bundles)
    npm run watch       (rebuild on file save)
    npm run package     (build + package to .vsix)

  Install after packaging:
    code --install-extension synapse-1.0.0.vsix --force


--------------------------------------------------------------------------------
 BLUEPRINT JSON FORMAT
--------------------------------------------------------------------------------

  Plain JSON in VS Code workspace storage. Inspect, back up, or hand-edit.

  {
    "version": "1.0",
    "project": "My Project",
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
        "position": { "x": 100, "y": 80 }
      }
    ],
    "edges": [
      { "id": "uuid-v4", "source": "node-id-a", "target": "node-id-b",
        "label": "depends on" }
    ]
  }


--------------------------------------------------------------------------------
 LICENSE
--------------------------------------------------------------------------------

  Synapse Blueprint is licensed under Creative Commons Attribution-
  NonCommercial 4.0 International (CC BY-NC 4.0).

  Free for personal use, open source projects, and non-commercial work.
  Not permitted for commercial use without written permission from the author.

  See the LICENSE file for full terms.
  https://creativecommons.org/licenses/by-nc/4.0/


--------------------------------------------------------------------------------
 SUPPORT
--------------------------------------------------------------------------------

  Synapse Blueprint is free and built by an independent developer.
  If it saves you time and you would like to say thanks, a small donation
  is always appreciated.

    Ko-fi: https://ko-fi.com/d3bas3ai

  No pressure — enjoying the extension is enough.


================================================================================
 END OF README
================================================================================
