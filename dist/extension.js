"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));

// src/BlueprintStore.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// node_modules/uuid/dist/esm-node/rng.js
var import_crypto = __toESM(require("crypto"));
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    import_crypto.default.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

// node_modules/uuid/dist/esm-node/native.js
var import_crypto2 = __toESM(require("crypto"));
var native_default = {
  randomUUID: import_crypto2.default.randomUUID
};

// node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// src/BlueprintStore.ts
var SNAPSHOT_SLOTS = 5;
var CHANGELOG_CAP = 500;
function computeDiff(snapshot, current) {
  const changes = [];
  for (const n of current.nodes) {
    if (!snapshot.nodes.find((sn) => sn.id === n.id))
      changes.push(`+ "${n.label}" [${n.type}, ${n.status}] \u2014 added since checkpoint`);
  }
  for (const sn of snapshot.nodes) {
    if (!current.nodes.find((n) => n.id === sn.id))
      changes.push(`- "${sn.label}" [${sn.type}, ${sn.status}] \u2014 removed since checkpoint`);
  }
  for (const sn of snapshot.nodes) {
    const cn = current.nodes.find((n) => n.id === sn.id);
    if (!cn) continue;
    const diffs = [];
    if (sn.status !== cn.status) diffs.push(`status ${cn.status} \u2192 ${sn.status}`);
    if (sn.type !== cn.type) diffs.push(`type ${cn.type} \u2192 ${sn.type}`);
    if (sn.label !== cn.label) diffs.push(`label "${cn.label}" \u2192 "${sn.label}"`);
    if (sn.priority !== cn.priority) diffs.push(`priority ${cn.priority ?? "none"} \u2192 ${sn.priority ?? "none"}`);
    if (sn.description !== cn.description) diffs.push(`description changed`);
    if ((sn.notes ?? "") !== (cn.notes ?? "")) diffs.push(`notes changed`);
    if (diffs.length) changes.push(`~ "${cn.label}" \u2014 ${diffs.join(", ")}`);
  }
  for (const e of current.edges) {
    if (!snapshot.edges.find((se) => se.id === e.id)) {
      const src = current.nodes.find((n) => n.id === e.source)?.label ?? e.source;
      const tgt = current.nodes.find((n) => n.id === e.target)?.label ?? e.target;
      changes.push(`+ edge ${src} \u2192 ${tgt} \u2014 added since checkpoint`);
    }
  }
  for (const se of snapshot.edges) {
    if (!current.edges.find((e) => e.id === se.id)) {
      const src = snapshot.nodes.find((n) => n.id === se.source)?.label ?? se.source;
      const tgt = snapshot.nodes.find((n) => n.id === se.target)?.label ?? se.target;
      changes.push(`- edge ${src} \u2192 ${tgt} \u2014 removed since checkpoint`);
    }
  }
  return changes.length > 0 ? changes : ["No changes since checkpoint"];
}
var BlueprintStore = class {
  constructor(storageDir, projectName) {
    this.changeListeners = [];
    this.saveListeners = [];
    this.externalChangeListeners = [];
    this.ignoreNextWatch = false;
    this.nextSnapshotSlot = 0;
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
    this.filePath = path.join(storageDir, "blueprint.json");
    this.snapshotDir = storageDir;
    this.blueprint = this.load(projectName);
    this.migrateSeq();
    this.initSnapshotSlot();
  }
  migrateSeq() {
    if (this.blueprint.nextSeq) return;
    const sorted = [...this.blueprint.nodes].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    sorted.forEach((n, i) => {
      const node = this.blueprint.nodes.find((x) => x.id === n.id);
      if (!node.seq) node.seq = i + 1;
    });
    this.blueprint.nextSeq = this.blueprint.nodes.length + 1;
    this.save();
  }
  load(projectName) {
    if (fs.existsSync(this.filePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      } catch {
      }
    }
    const fresh = {
      version: "1.0",
      project: projectName ?? "",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      nodes: [],
      edges: []
    };
    fs.writeFileSync(this.filePath, JSON.stringify(fresh, null, 2), "utf-8");
    return fresh;
  }
  save() {
    this.blueprint.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.ignoreNextWatch = true;
    fs.writeFileSync(this.filePath, JSON.stringify(this.blueprint, null, 2), "utf-8");
    const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.saveListeners.forEach((fn) => fn(ts));
    this.changeListeners.forEach((fn) => fn());
  }
  watchExternal() {
    try {
      this.watcher = fs.watch(this.filePath, () => {
        if (this.ignoreNextWatch) {
          this.ignoreNextWatch = false;
          return;
        }
        try {
          const fresh = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
          this.blueprint = fresh;
          this.changeListeners.forEach((fn) => fn());
          const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          this.externalChangeListeners.forEach((fn) => fn(ts));
        } catch {
        }
      });
    } catch (err) {
      console.error("Blueprint: could not watch file \u2014", err.message);
    }
  }
  onChange(fn) {
    this.changeListeners.push(fn);
  }
  onSave(fn) {
    this.saveListeners.push(fn);
  }
  onExternalChange(fn) {
    this.externalChangeListeners.push(fn);
  }
  getBlueprint() {
    return this.blueprint;
  }
  getFilePath() {
    return this.filePath;
  }
  // ── Node ops ─────────────────────────────────────────────────────────────────
  addNode(fields) {
    const seq = this.blueprint.nextSeq ?? this.blueprint.nodes.length + 1;
    this.blueprint.nextSeq = seq + 1;
    const node = {
      ...fields,
      id: v4_default(),
      seq,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.blueprint.nodes.push(node);
    this.appendChangelog("added", node.label, `${node.type}, ${node.status}`);
    this.save();
    return node;
  }
  updateNode(id, fields) {
    const idx = this.blueprint.nodes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    const before = this.blueprint.nodes[idx];
    this.blueprint.nodes[idx] = { ...before, ...fields, id, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (fields.status || fields.type || fields.label) {
      const changes = [];
      if (fields.status && fields.status !== before.status) changes.push(`status: ${before.status} \u2192 ${fields.status}`);
      if (fields.type && fields.type !== before.type) changes.push(`type: ${before.type} \u2192 ${fields.type}`);
      if (fields.label && fields.label !== before.label) changes.push(`label: "${before.label}" \u2192 "${fields.label}"`);
      if (changes.length) this.appendChangelog("updated", before.label, changes.join(", "));
    }
    this.save();
    return this.blueprint.nodes[idx];
  }
  removeNode(id) {
    const node = this.blueprint.nodes.find((n) => n.id === id);
    const before = this.blueprint.nodes.length;
    this.blueprint.nodes = this.blueprint.nodes.filter((n) => n.id !== id);
    this.blueprint.edges = this.blueprint.edges.filter((e) => e.source !== id && e.target !== id);
    if (this.blueprint.nodes.length === before) return false;
    if (node) this.appendChangelog("removed", node.label, `${node.type}, ${node.status}`);
    this.save();
    return true;
  }
  getNode(id) {
    return this.blueprint.nodes.find((n) => n.id === id);
  }
  // ── Edge ops ─────────────────────────────────────────────────────────────────
  addEdge(source, target, label) {
    const exists = this.blueprint.edges.find((e) => e.source === source && e.target === target);
    if (exists) return exists;
    const edge = { id: v4_default(), source, target, label };
    this.blueprint.edges.push(edge);
    this.save();
    return edge;
  }
  removeEdge(id) {
    const before = this.blueprint.edges.length;
    this.blueprint.edges = this.blueprint.edges.filter((e) => e.id !== id);
    this.save();
    return this.blueprint.edges.length < before;
  }
  // ── Import / Export ──────────────────────────────────────────────────────────
  exportData() {
    return JSON.stringify(this.blueprint, null, 2);
  }
  importData(json) {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error("Invalid blueprint: file must contain nodes and edges arrays.");
    }
    this.blueprint = parsed;
    this.cachedDiff = void 0;
    this.save();
  }
  reset(projectName) {
    this.blueprint = {
      version: "1.0",
      project: projectName,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      nodes: [],
      edges: []
    };
    this.save();
  }
  // ── Snapshot / undo ──────────────────────────────────────────────────────────
  initSnapshotSlot() {
    for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
      if (!fs.existsSync(path.join(this.snapshotDir, `snapshot-${i}.json`))) {
        this.nextSnapshotSlot = i;
        return;
      }
    }
    let times = [];
    for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(this.snapshotDir, `snapshot-${i}.json`), "utf-8"));
        times.push({ slot: i, time: d._snapshot_time ? new Date(d._snapshot_time).getTime() : 0 });
      } catch {
        this.nextSnapshotSlot = i;
        return;
      }
    }
    times.sort((a, b) => a.time - b.time);
    this.nextSnapshotSlot = times[0].slot;
  }
  saveSnapshot() {
    const slot = this.nextSnapshotSlot;
    const time = (/* @__PURE__ */ new Date()).toISOString();
    const snap = { ...this.blueprint, _snapshot_time: time };
    fs.writeFileSync(path.join(this.snapshotDir, `snapshot-${slot}.json`), JSON.stringify(snap, null, 2), "utf-8");
    this.nextSnapshotSlot = (slot + 1) % SNAPSHOT_SLOTS;
    this.cachedDiff = void 0;
    this.appendChangelog("checkpoint", "Snapshot saved", `slot ${slot}`);
    return { slot, time };
  }
  getSnapshotInfos() {
    const infos = [];
    for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
      const p = path.join(this.snapshotDir, `snapshot-${i}.json`);
      if (!fs.existsSync(p)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (d._snapshot_time) infos.push({ slot: i, time: d._snapshot_time });
      } catch {
      }
    }
    return infos.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }
  getDiffFromNewestSnapshot() {
    const infos = this.getSnapshotInfos();
    if (!infos.length) return [];
    const cacheKey = infos[0].time + ":" + this.blueprint.updated_at;
    if (this.cachedDiff?.key === cacheKey) return this.cachedDiff.diff;
    const p = path.join(this.snapshotDir, `snapshot-${infos[0].slot}.json`);
    try {
      const { _snapshot_time, ...snap } = JSON.parse(fs.readFileSync(p, "utf-8"));
      const diff = computeDiff(snap, this.blueprint);
      this.cachedDiff = { key: cacheKey, diff };
      return diff;
    } catch {
      return [];
    }
  }
  restoreSnapshot(slot) {
    const p = path.join(this.snapshotDir, `snapshot-${slot}.json`);
    if (!fs.existsSync(p)) return [];
    try {
      const { _snapshot_time, ...snap } = JSON.parse(fs.readFileSync(p, "utf-8"));
      const changes = computeDiff(snap, this.blueprint);
      this.blueprint = {
        ...snap,
        undo_pending: true,
        undo_diff: { snapshot_time: _snapshot_time, changes }
      };
      this.cachedDiff = void 0;
      this.appendChangelog("restored", "Rolled back to checkpoint", `slot ${slot}, ${changes.length} change(s)`);
      this.save();
      return changes;
    } catch {
      return [];
    }
  }
  // ── Changelog ────────────────────────────────────────────────────────────────
  appendChangelog(action, label, details) {
    const logPath = path.join(this.snapshotDir, "changelog.json");
    let log = { entries: [] };
    if (fs.existsSync(logPath)) {
      try {
        log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      } catch {
      }
    }
    log.entries.push({ time: (/* @__PURE__ */ new Date()).toISOString(), action, label, details });
    if (log.entries.length > CHANGELOG_CAP) log.entries = log.entries.slice(-CHANGELOG_CAP);
    try {
      fs.writeFileSync(logPath, JSON.stringify(log, null, 2), "utf-8");
    } catch {
    }
  }
  dispose() {
    this.watcher?.close();
  }
};

// src/BlueprintPanel.ts
var vscode = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var BlueprintPanel = class _BlueprintPanel {
  constructor(panel, store2, extensionUri) {
    this.disposables = [];
    this.panel = panel;
    this.store = store2;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );
    store2.onChange(() => {
      this.panel.title = _BlueprintPanel.panelTitle(this.store);
      this.refresh();
    });
    store2.onExternalChange((timestamp) => {
      this.panel.webview.postMessage({ type: "save-status", state: "saved", timestamp });
    });
    store2.onSave((timestamp) => {
      this.panel.webview.postMessage({ type: "save-status", state: "saved", timestamp });
    });
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }
  static panelTitle(store2) {
    const name = store2.getBlueprint().project?.trim();
    return name ? `${name} Synapse` : "Synapse";
  }
  static createOrShow(extensionUri, store2) {
    const column = vscode.ViewColumn.Beside;
    if (_BlueprintPanel.currentPanel) {
      _BlueprintPanel.currentPanel.panel.reveal(column);
      _BlueprintPanel.currentPanel.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "synapse",
      _BlueprintPanel.panelTitle(store2),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist"),
          vscode.Uri.joinPath(extensionUri, "media")
        ]
      }
    );
    _BlueprintPanel.currentPanel = new _BlueprintPanel(panel, store2, extensionUri);
  }
  refresh() {
    this.panel.webview.postMessage({ type: "full-refresh", blueprint: this.store.getBlueprint() });
    this.sendSnapshotState();
  }
  sendSnapshotState() {
    const snapshots = this.store.getSnapshotInfos();
    const diff = snapshots.length > 0 ? this.store.getDiffFromNewestSnapshot() : [];
    this.panel.webview.postMessage({ type: "snapshot-state", snapshots, diff });
  }
  async handleMessage(msg) {
    switch (msg.type) {
      case "ready":
        this.panel.webview.postMessage({ type: "init", blueprint: this.store.getBlueprint() });
        this.sendSnapshotState();
        break;
      case "add-node": {
        this.panel.webview.postMessage({ type: "save-status", state: "saving" });
        const node = this.store.addNode(msg.node);
        this.panel.webview.postMessage({ type: "node-added", node });
        break;
      }
      case "update-node": {
        this.panel.webview.postMessage({ type: "save-status", state: "saving" });
        const node = this.store.updateNode(msg.id, msg.fields);
        if (node) this.panel.webview.postMessage({ type: "node-updated", node });
        break;
      }
      case "remove-node":
        this.panel.webview.postMessage({ type: "save-status", state: "saving" });
        this.store.removeNode(msg.id);
        this.panel.webview.postMessage({ type: "node-removed", id: msg.id });
        break;
      case "move-node":
        this.store.updateNode(msg.id, { position: msg.position });
        break;
      case "add-edge": {
        this.panel.webview.postMessage({ type: "save-status", state: "saving" });
        const edge = this.store.addEdge(msg.source, msg.target, msg.label);
        this.panel.webview.postMessage({ type: "edge-added", edge });
        break;
      }
      case "remove-edge":
        this.panel.webview.postMessage({ type: "save-status", state: "saving" });
        this.store.removeEdge(msg.id);
        this.panel.webview.postMessage({ type: "edge-removed", id: msg.id });
        break;
      case "export": {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path2.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "", "blueprint-export.json")),
          filters: { "Blueprint JSON": ["json"] },
          title: "Export Blueprint"
        });
        if (uri) {
          const { writeFileSync: writeFileSync3 } = await import("fs");
          writeFileSync3(uri.fsPath, this.store.exportData(), "utf-8");
          vscode.window.showInformationMessage(`Blueprint exported to ${uri.fsPath}`);
        }
        break;
      }
      case "snapshot": {
        const info = this.store.saveSnapshot();
        this.sendSnapshotState();
        vscode.window.showInformationMessage(`Synapse checkpoint saved at ${new Date(info.time).toLocaleTimeString()}`);
        break;
      }
      case "restore-snapshot": {
        this.store.restoreSnapshot(msg.slot);
        this.refresh();
        break;
      }
      case "import": {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "Blueprint JSON": ["json"] },
          title: "Import Blueprint"
        });
        if (uris?.[0]) {
          try {
            const { readFileSync: readFileSync4 } = await import("fs");
            const json = readFileSync4(uris[0].fsPath, "utf-8");
            const current = this.store.getBlueprint();
            const confirm = await vscode.window.showWarningMessage(
              `Import will replace your current map (${current.nodes.length} nodes). A checkpoint will be saved first.`,
              { modal: true },
              "Import"
            );
            if (confirm !== "Import") break;
            this.store.saveSnapshot();
            this.store.importData(json);
            this.panel.webview.postMessage({ type: "full-refresh", blueprint: this.store.getBlueprint() });
            vscode.window.showInformationMessage("Blueprint imported. Previous map saved as checkpoint.");
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to import: ${err.message ?? "file is not a valid blueprint."}`);
          }
        }
        break;
      }
    }
  }
  getHtml() {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css"));
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
    _BlueprintPanel.currentPanel = void 0;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
};

// src/llm-config.ts
var vscode2 = __toESM(require("vscode"));
var fs2 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var KNOWN_LLMS = [
  { id: "claude", name: "Anthropic", extensionIds: ["anthropic.claude-code"] },
  { id: "copilot", name: "GitHub Copilot", extensionIds: ["github.copilot", "github.copilot-chat"] },
  { id: "continue", name: "Continue", extensionIds: ["continue.continue"] },
  { id: "cline", name: "Cline", extensionIds: ["saoudrizwan.claude-dev"] },
  { id: "roo", name: "Roo Code", extensionIds: ["rooveterinaryinc.roo-cline"] }
];
function detectLLMs() {
  const found = [];
  for (const llm of KNOWN_LLMS) {
    const installed = llm.extensionIds.some((id) => !!vscode2.extensions.getExtension(id));
    if (installed) found.push({ id: llm.id, name: llm.name });
  }
  return found;
}
var MARKER_START = "<!-- synapse:start -->";
var MARKER_END = "<!-- synapse:end -->";
function buildInstructionBlock(projectName) {
  return [
    MARKER_START,
    "",
    "## Synapse Blueprint",
    "",
    `This project uses Synapse Blueprint for context tracking. The Synapse MCP server`,
    `injects full session rules and instructions automatically at connection time.`,
    "",
    `If the Synapse MCP server is not connected, run **Synapse: Setup Walkthrough**`,
    `from the VS Code command palette (Ctrl+Shift+P) to configure it.`,
    "",
    MARKER_END
  ].join("\n");
}
function writeInstructionFile(filePath, projectName, header) {
  const block = buildInstructionBlock(projectName);
  if (!fs2.existsSync(filePath)) {
    fs2.writeFileSync(filePath, `${header}

${block}
`, "utf-8");
    return;
  }
  const existing = fs2.readFileSync(filePath, "utf-8");
  if (existing.includes(MARKER_START)) {
    const updated = existing.replace(
      new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`),
      block
    );
    if (updated !== existing) fs2.writeFileSync(filePath, updated, "utf-8");
    return;
  }
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  fs2.writeFileSync(filePath, existing + sep + block + "\n", "utf-8");
}
function nodePath() {
  return "node";
}
function mcpServerEntry(mcpServerPath, blueprintPath, workspaceRoot) {
  return {
    command: nodePath(),
    args: [mcpServerPath],
    env: { BLUEPRINT_PATH: blueprintPath, WORKSPACE_ROOT: workspaceRoot }
  };
}
function writeJsonFile(filePath, updater) {
  let cfg = {};
  if (fs2.existsSync(filePath)) {
    try {
      cfg = JSON.parse(fs2.readFileSync(filePath, "utf-8"));
    } catch {
    }
  }
  const updated = updater(cfg);
  fs2.mkdirSync(path3.dirname(filePath), { recursive: true });
  fs2.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");
}
function configureAnthropicCode(projectRoot, mcpServerPath, blueprintPath, projectName) {
  const mcpJsonPath = path3.join(projectRoot, ".mcp.json");
  writeJsonFile(mcpJsonPath, (cfg) => {
    if (!cfg.mcpServers) cfg.mcpServers = {};
    cfg.mcpServers.synapse = mcpServerEntry(mcpServerPath, blueprintPath, projectRoot);
    return cfg;
  });
  writeInstructionFile(path3.join(projectRoot, "CLAUDE.md"), projectName, `# ${projectName}`);
}
function configureCopilot(projectRoot, mcpServerPath, blueprintPath, projectName) {
  const vscodeDir = path3.join(projectRoot, ".vscode");
  writeJsonFile(path3.join(vscodeDir, "mcp.json"), (cfg) => {
    if (!cfg.servers) cfg.servers = {};
    cfg.servers.synapse = mcpServerEntry(mcpServerPath, blueprintPath, projectRoot);
    return cfg;
  });
  writeInstructionFile(
    path3.join(projectRoot, ".github", "copilot-instructions.md"),
    projectName,
    `# ${projectName} \u2014 Copilot Instructions`
  );
}
function configureContinue(projectRoot, mcpServerPath, blueprintPath, projectName) {
  const cfgPath = path3.join(projectRoot, ".continue", "config.json");
  writeJsonFile(cfgPath, (cfg) => {
    if (!cfg.mcpServers) cfg.mcpServers = [];
    const idx = cfg.mcpServers.findIndex((s) => s.name === "synapse");
    const entry = { name: "synapse", ...mcpServerEntry(mcpServerPath, blueprintPath, projectRoot) };
    if (idx === -1) cfg.mcpServers.push(entry);
    else cfg.mcpServers[idx] = entry;
    return cfg;
  });
  writeInstructionFile(path3.join(projectRoot, ".continuerules"), projectName, `# ${projectName}`);
}
function configureCline(projectRoot, mcpServerPath, blueprintPath, projectName) {
  const mcpJsonPath = path3.join(projectRoot, ".mcp.json");
  writeJsonFile(mcpJsonPath, (cfg) => {
    if (!cfg.mcpServers) cfg.mcpServers = {};
    cfg.mcpServers.synapse = mcpServerEntry(mcpServerPath, blueprintPath, projectRoot);
    return cfg;
  });
  writeInstructionFile(path3.join(projectRoot, ".clinerules"), projectName, `# ${projectName}`);
}
function configureLLMs(detectedLLMs, projectRoot, mcpServerPath, blueprintPath, projectName) {
  try {
    for (const llm of detectedLLMs) {
      switch (llm.id) {
        case "claude":
          configureAnthropicCode(projectRoot, mcpServerPath, blueprintPath, projectName);
          break;
        case "copilot":
          configureCopilot(projectRoot, mcpServerPath, blueprintPath, projectName);
          break;
        case "continue":
          configureContinue(projectRoot, mcpServerPath, blueprintPath, projectName);
          break;
        case "cline":
        case "roo":
          configureCline(projectRoot, mcpServerPath, blueprintPath, projectName);
          break;
      }
    }
  } catch (err) {
    console.error("Blueprint: could not write LLM config \u2014", err.message);
  }
}
function allSupportedLLMs() {
  return KNOWN_LLMS.map((l) => ({ id: l.id, name: l.name }));
}

// src/extension.ts
var store;
function activate(context) {
  const workspaceFolders = vscode3.workspace.workspaceFolders;
  if (!context.globalState.get("synapse.welcomed")) {
    showWelcomeNotification(context);
  }
  if (workspaceFolders?.length) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const projectName = path4.basename(workspaceRoot);
    const storageDir = context.storageUri.fsPath;
    store = new BlueprintStore(storageDir, projectName);
    store.watchExternal();
    const mcpServerPath = path4.join(context.extensionPath, "dist", "mcp-server.js").replace(/\\/g, "/");
    const blueprintPath = store.getFilePath().replace(/\\/g, "/");
    const alreadySetUp = context.workspaceState.get("synapse.setup-done");
    const hasExternalMcp = hasExistingMcpConfig(workspaceRoot);
    if (!alreadySetUp && !hasExternalMcp) {
      showProjectSetupPrompt(context, workspaceRoot, projectName, mcpServerPath, blueprintPath);
    } else if (!hasExternalMcp) {
      const detected = detectLLMs();
      if (detected.length > 0) {
        configureLLMs(detected, workspaceRoot, mcpServerPath, blueprintPath, projectName);
      }
      const autoOpen = vscode3.workspace.getConfiguration("synapse").get("autoOpen", true);
      if (autoOpen && store.getBlueprint().nodes.length > 0) {
        BlueprintPanel.createOrShow(context.extensionUri, store);
      }
    } else {
    }
    const statusBar = vscode3.window.createStatusBarItem(vscode3.StatusBarAlignment.Left, 100);
    statusBar.command = "synapse.open";
    statusBar.tooltip = "Open Synapse canvas";
    context.subscriptions.push(statusBar);
    const updateStatusBar = () => {
      if (!store) return;
      const b = store.getBlueprint();
      const done = b.nodes.filter((n) => n.status === "done").length;
      const inProgress = b.nodes.filter((n) => n.status === "in-progress").length;
      const planned = b.nodes.filter((n) => n.status === "planned").length;
      statusBar.text = `$(circuit-board) ${b.project || "Synapse"}: ${b.nodes.length} nodes  \u2713${done}  \u27F3${inProgress}  \u25CB${planned}`;
      statusBar.show();
    };
    store.onChange(updateStatusBar);
    updateStatusBar();
  }
  registerCommands(context);
}
function hasExistingMcpConfig(workspaceRoot) {
  const candidates = [
    path4.join(workspaceRoot, ".mcp.json"),
    path4.join(workspaceRoot, ".vscode", "mcp.json")
  ];
  for (const p of candidates) {
    if (!fs3.existsSync(p)) continue;
    try {
      const cfg = JSON.parse(fs3.readFileSync(p, "utf-8"));
      const servers = cfg.mcpServers ?? cfg.servers ?? {};
      if (servers.blueprint || servers.synapse) return true;
    } catch {
    }
  }
  return false;
}
function showWelcomeNotification(context) {
  const supported = allSupportedLLMs().map((l) => l.name).join(", ");
  vscode3.window.showInformationMessage(
    `Synapse installed! Open any project and it will auto-connect to your LLM (supports ${supported}).`,
    "Setup Walkthrough",
    "Got It"
  ).then((choice) => {
    if (choice === "Setup Walkthrough") {
      vscode3.commands.executeCommand("workbench.action.openWalkthrough", { category: "synapse-tools.synapse#synapse.setup" }, false);
    }
    context.globalState.update("synapse.welcomed", true);
  });
}
function showProjectSetupPrompt(context, workspaceRoot, projectName, mcpServerPath, blueprintPath) {
  const detected = detectLLMs();
  const detectedStr = detected.length > 0 ? detected.map((l) => l.name).join(", ") : "None detected \u2014 manual setup available via Setup Walkthrough";
  const detail = [
    `Detected LLM(s): ${detectedStr}`,
    "",
    "Synapse will:",
    "  \u2022 Store your project map privately in VS Code workspace storage",
    "  \u2022 Write MCP config files so your LLM can read and update the map",
    "  \u2022 Add instruction files so your LLM orients itself automatically each session",
    "",
    "Nothing is sent anywhere. All files stay local."
  ].join("\n");
  vscode3.window.showInformationMessage(
    `Synapse: Set up "${projectName}"?`,
    { modal: true, detail },
    "Set Up",
    "Not Now"
  ).then((choice) => {
    if (choice !== "Set Up") return;
    if (!store) return;
    if (detected.length > 0) {
      configureLLMs(detected, workspaceRoot, mcpServerPath, blueprintPath, projectName);
    }
    context.workspaceState.update("synapse.setup-done", true);
    const msg = detected.length > 0 ? `Synapse is ready for ${detected.map((l) => l.name).join(", ")}.` : "Synapse canvas is ready. No LLM was auto-detected \u2014 run the Setup Walkthrough to connect one manually.";
    vscode3.window.showInformationMessage(msg, "Open Canvas", "Setup Walkthrough").then((sel) => {
      if (sel === "Open Canvas") vscode3.commands.executeCommand("synapse.open");
      if (sel === "Setup Walkthrough") {
        vscode3.commands.executeCommand("workbench.action.openWalkthrough", { category: "synapse-tools.synapse#synapse.setup" }, false);
      }
    });
  });
}
function getOrCreateStore(context) {
  if (store) return store;
  const folders = vscode3.workspace.workspaceFolders;
  if (!folders?.length) {
    vscode3.window.showErrorMessage(
      "Synapse needs a project folder open. Open the folder containing your project and try again.",
      "Open Folder\u2026"
    ).then((c) => {
      if (c === "Open Folder\u2026") vscode3.commands.executeCommand("vscode.openFolder");
    });
    return void 0;
  }
  const projectName = path4.basename(folders[0].uri.fsPath);
  store = new BlueprintStore(context.storageUri.fsPath, projectName);
  store.watchExternal();
  return store;
}
function registerCommands(context) {
  context.subscriptions.push(
    vscode3.commands.registerCommand("synapse.open", () => {
      const s = getOrCreateStore(context);
      if (s) BlueprintPanel.createOrShow(context.extensionUri, s);
    }),
    vscode3.commands.registerCommand("synapse.walkthrough", () => {
      vscode3.commands.executeCommand(
        "workbench.action.openWalkthrough",
        { category: "synapse-tools.synapse#synapse.setup" },
        false
      );
    }),
    vscode3.commands.registerCommand("synapse.reset", async () => {
      const s = getOrCreateStore(context);
      if (!s) return;
      const name = await vscode3.window.showInputBox({
        prompt: "Project name for the map",
        value: vscode3.workspace.name ?? "My Project"
      });
      if (!name) return;
      const confirm = await vscode3.window.showWarningMessage(
        `Reset Synapse map for "${name}"? All nodes will be cleared.`,
        { modal: true },
        "Reset"
      );
      if (confirm !== "Reset") return;
      s.reset(name);
      BlueprintPanel.createOrShow(context.extensionUri, s);
    })
  );
}
function deactivate() {
  store?.dispose();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
