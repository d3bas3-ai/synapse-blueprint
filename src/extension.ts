import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BlueprintStore } from './BlueprintStore';
import { BlueprintPanel } from './BlueprintPanel';
import { detectLLMs, configureLLMs, allSupportedLLMs } from './llm-config';

let store: BlueprintStore | undefined;

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!context.globalState.get<boolean>('synapse.welcomed')) {
    showWelcomeNotification(context);
  }

  if (workspaceFolders?.length) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const projectName   = path.basename(workspaceRoot);
    const storageDir    = context.storageUri!.fsPath;

    store = new BlueprintStore(storageDir, projectName);
    store.watchExternal();

    const mcpServerPath = path.join(context.extensionPath, 'dist', 'mcp-server.js').replace(/\\/g, '/');
    const blueprintPath = store.getFilePath().replace(/\\/g, '/');
    const alreadySetUp  = context.workspaceState.get<boolean>('synapse.setup-done');
    const hasExternalMcp = hasExistingMcpConfig(workspaceRoot);

    if (!alreadySetUp && !hasExternalMcp) {
      // Brand-new project — ask before doing anything
      showProjectSetupPrompt(context, workspaceRoot, projectName, mcpServerPath, blueprintPath);
    } else if (!hasExternalMcp) {
      // Returning Synapse project — silently keep its own configs current
      const detected = detectLLMs();
      if (detected.length > 0) {
        configureLLMs(detected, workspaceRoot, mcpServerPath, blueprintPath, projectName);
      }
      const autoOpen = vscode.workspace.getConfiguration('synapse').get<boolean>('autoOpen', true);
      if (autoOpen && store.getBlueprint().nodes.length > 0) {
        BlueprintPanel.createOrShow(context.extensionUri, store);
      }
    } else {
      // Project already managed by another MCP extension — stay silent
    }

    // Status bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = 'synapse.open';
    statusBar.tooltip = 'Open Synapse canvas';
    context.subscriptions.push(statusBar);

    const updateStatusBar = () => {
      if (!store) return;
      const b = store.getBlueprint();
      const done       = b.nodes.filter(n => n.status === 'done').length;
      const inProgress = b.nodes.filter(n => n.status === 'in-progress').length;
      const planned    = b.nodes.filter(n => n.status === 'planned').length;
      statusBar.text = `$(circuit-board) ${b.project || 'Synapse'}: ${b.nodes.length} nodes  ✓${done}  ⟳${inProgress}  ○${planned}`;
      statusBar.show();
    };
    store.onChange(updateStatusBar);
    updateStatusBar();
  }

  registerCommands(context);
}

// ── Check if project already has any MCP blueprint config ────────────────────
function hasExistingMcpConfig(workspaceRoot: string): boolean {
  const candidates = [
    path.join(workspaceRoot, '.mcp.json'),
    path.join(workspaceRoot, '.vscode', 'mcp.json'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      // Has any MCP server entry that looks blueprint-related
      const servers = cfg.mcpServers ?? cfg.servers ?? {};
      if (servers.blueprint || servers.synapse) return true;
    } catch {}
  }
  return false;
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function showWelcomeNotification(context: vscode.ExtensionContext) {
  const supported = allSupportedLLMs().map(l => l.name).join(', ');
  vscode.window.showInformationMessage(
    `Synapse installed! Open any project and it will auto-connect to your LLM (supports ${supported}).`,
    'Setup Walkthrough', 'Got It'
  ).then(choice => {
    if (choice === 'Setup Walkthrough') {
      vscode.commands.executeCommand('workbench.action.openWalkthrough', { category: 'synapse-tools.synapse#synapse.setup' }, false);
    }
    context.globalState.update('synapse.welcomed', true);
  });
}

// ── Per-project setup prompt ──────────────────────────────────────────────────
function showProjectSetupPrompt(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  projectName: string,
  mcpServerPath: string,
  blueprintPath: string,
) {
  const detected    = detectLLMs();
  const detectedStr = detected.length > 0
    ? detected.map(l => l.name).join(', ')
    : 'None detected — manual setup available via Setup Walkthrough';

  const detail = [
    `Detected LLM(s): ${detectedStr}`,
    '',
    'Synapse will:',
    '  • Store your project map privately in VS Code workspace storage',
    '  • Write MCP config files so your LLM can read and update the map',
    '  • Add instruction files so your LLM orients itself automatically each session',
    '',
    'Nothing is sent anywhere. All files stay local.',
  ].join('\n');

  vscode.window.showInformationMessage(
    `Synapse: Set up "${projectName}"?`,
    { modal: true, detail },
    'Set Up', 'Not Now'
  ).then(choice => {
    if (choice !== 'Set Up') return;
    if (!store) return;

    if (detected.length > 0) {
      configureLLMs(detected, workspaceRoot, mcpServerPath, blueprintPath, projectName);
    }
    context.workspaceState.update('synapse.setup-done', true);

    const msg = detected.length > 0
      ? `Synapse is ready for ${detected.map(l => l.name).join(', ')}.`
      : 'Synapse canvas is ready. No LLM was auto-detected — run the Setup Walkthrough to connect one manually.';

    vscode.window.showInformationMessage(msg, 'Open Canvas', 'Setup Walkthrough').then(sel => {
      if (sel === 'Open Canvas') vscode.commands.executeCommand('synapse.open');
      if (sel === 'Setup Walkthrough') {
        vscode.commands.executeCommand('workbench.action.openWalkthrough', { category: 'synapse-tools.synapse#synapse.setup' }, false);
      }
    });
  });
}

// ── Commands ──────────────────────────────────────────────────────────────────
function getOrCreateStore(context: vscode.ExtensionContext): BlueprintStore | undefined {
  if (store) return store;
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    vscode.window.showErrorMessage(
      'Synapse needs a project folder open. Open the folder containing your project and try again.',
      'Open Folder…'
    ).then(c => { if (c === 'Open Folder…') vscode.commands.executeCommand('vscode.openFolder'); });
    return undefined;
  }
  const projectName = path.basename(folders[0].uri.fsPath);
  store = new BlueprintStore(context.storageUri!.fsPath, projectName);
  store.watchExternal();
  return store;
}

function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('synapse.open', () => {
      const s = getOrCreateStore(context);
      if (s) BlueprintPanel.createOrShow(context.extensionUri, s);
    }),

    vscode.commands.registerCommand('synapse.walkthrough', () => {
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        { category: 'synapse-tools.synapse#synapse.setup' },
        false
      );
    }),

    vscode.commands.registerCommand('synapse.reset', async () => {
      const s = getOrCreateStore(context);
      if (!s) return;
      const name = await vscode.window.showInputBox({
        prompt: 'Project name for the map',
        value: vscode.workspace.name ?? 'My Project',
      });
      if (!name) return;
      const confirm = await vscode.window.showWarningMessage(
        `Reset Synapse map for "${name}"? All nodes will be cleared.`,
        { modal: true }, 'Reset'
      );
      if (confirm !== 'Reset') return;
      s.reset(name);
      BlueprintPanel.createOrShow(context.extensionUri, s);
    })
  );
}

export function deactivate() {
  store?.dispose();
}
