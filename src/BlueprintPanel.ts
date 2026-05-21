import * as vscode from 'vscode';
import * as path from 'path';
import { BlueprintStore } from './BlueprintStore';
import { WebToExtMsg } from './types';

export class BlueprintPanel {
  static currentPanel: BlueprintPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly store: BlueprintStore;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  static panelTitle(store: BlueprintStore): string {
    const name = store.getBlueprint().project?.trim();
    return name ? `${name} Synapse` : 'Synapse';
  }

  static createOrShow(extensionUri: vscode.Uri, store: BlueprintStore) {
    const column = vscode.ViewColumn.Beside;
    if (BlueprintPanel.currentPanel) {
      BlueprintPanel.currentPanel.panel.reveal(column);
      BlueprintPanel.currentPanel.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'synapse', BlueprintPanel.panelTitle(store), column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );
    BlueprintPanel.currentPanel = new BlueprintPanel(panel, store, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, store: BlueprintStore, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.store = store;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebToExtMsg) => this.handleMessage(msg),
      null, this.disposables
    );

    store.onChange(() => {
      this.panel.title = BlueprintPanel.panelTitle(this.store);
      this.refresh();
    });

    store.onExternalChange((timestamp) => {
      this.panel.webview.postMessage({ type: 'save-status', state: 'saved', timestamp });
    });

    store.onSave((timestamp) => {
      this.panel.webview.postMessage({ type: 'save-status', state: 'saved', timestamp });
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  refresh() {
    this.panel.webview.postMessage({ type: 'full-refresh', blueprint: this.store.getBlueprint() });
    this.sendSnapshotState();
  }

  private sendSnapshotState() {
    const snapshots = this.store.getSnapshotInfos();
    const diff      = snapshots.length > 0 ? this.store.getDiffFromNewestSnapshot() : [];
    this.panel.webview.postMessage({ type: 'snapshot-state', snapshots, diff });
  }

  private async handleMessage(msg: WebToExtMsg) {
    switch (msg.type) {
      case 'ready':
        this.panel.webview.postMessage({ type: 'init', blueprint: this.store.getBlueprint() });
        this.sendSnapshotState();
        break;

      case 'add-node': {
        // Signal saving before write
        this.panel.webview.postMessage({ type: 'save-status', state: 'saving' });
        const node = this.store.addNode(msg.node);
        this.panel.webview.postMessage({ type: 'node-added', node });
        break;
      }

      case 'update-node': {
        this.panel.webview.postMessage({ type: 'save-status', state: 'saving' });
        const node = this.store.updateNode(msg.id, msg.fields);
        if (node) this.panel.webview.postMessage({ type: 'node-updated', node });
        break;
      }

      case 'remove-node':
        this.panel.webview.postMessage({ type: 'save-status', state: 'saving' });
        this.store.removeNode(msg.id);
        this.panel.webview.postMessage({ type: 'node-removed', id: msg.id });
        break;

      case 'move-node':
        this.store.updateNode(msg.id, { position: msg.position });
        break;

      case 'add-edge': {
        this.panel.webview.postMessage({ type: 'save-status', state: 'saving' });
        const edge = this.store.addEdge(msg.source, msg.target, msg.label);
        this.panel.webview.postMessage({ type: 'edge-added', edge });
        break;
      }

      case 'remove-edge':
        this.panel.webview.postMessage({ type: 'save-status', state: 'saving' });
        this.store.removeEdge(msg.id);
        this.panel.webview.postMessage({ type: 'edge-removed', id: msg.id });
        break;

      case 'export': {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', 'blueprint-export.json')),
          filters: { 'Blueprint JSON': ['json'] },
          title: 'Export Blueprint',
        });
        if (uri) {
          const { writeFileSync } = await import('fs');
          writeFileSync(uri.fsPath, this.store.exportData(), 'utf-8');
          vscode.window.showInformationMessage(`Blueprint exported to ${uri.fsPath}`);
        }
        break;
      }

      case 'snapshot': {
        const info = this.store.saveSnapshot();
        this.sendSnapshotState();
        vscode.window.showInformationMessage(`Synapse checkpoint saved at ${new Date(info.time).toLocaleTimeString()}`);
        break;
      }

      case 'restore-snapshot': {
        this.store.restoreSnapshot(msg.slot);
        this.refresh();
        break;
      }

      case 'import': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'Blueprint JSON': ['json'] },
          title: 'Import Blueprint',
        });
        if (uris?.[0]) {
          try {
            const { readFileSync } = await import('fs');
            const json = readFileSync(uris[0].fsPath, 'utf-8');
            const current = this.store.getBlueprint();
            const confirm = await vscode.window.showWarningMessage(
              `Import will replace your current map (${current.nodes.length} nodes). A checkpoint will be saved first.`,
              { modal: true }, 'Import'
            );
            if (confirm !== 'Import') break;
            this.store.saveSnapshot();
            this.store.importData(json);
            this.panel.webview.postMessage({ type: 'full-refresh', blueprint: this.store.getBlueprint() });
            vscode.window.showInformationMessage('Blueprint imported. Previous map saved as checkpoint.');
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to import: ${err.message ?? 'file is not a valid blueprint.'}`);
          }
        }
        break;
      }
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri  = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src ${webview.cspSource} 'unsafe-inline';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource} data:;
             img-src ${webview.cspSource} data:;"/>
  <title>Blueprint</title>
  <link rel="stylesheet" href="${styleUri}"/>
  <style>* { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { width: 100%; height: 100%; background: #0d0d14; overflow: hidden; }</style>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    BlueprintPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
