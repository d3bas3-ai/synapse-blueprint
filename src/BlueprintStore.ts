import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Blueprint, BlueprintNode, BlueprintEdge, SnapshotInfo } from './types';

const SNAPSHOT_SLOTS  = 5;
const CHANGELOG_CAP   = 500;

// ── Diff helpers ──────────────────────────────────────────────────────────────
// Compares snapshot (before) vs current (after) and returns human-readable
// descriptions of what changed — used in the confirm dialog AND rollback notice.
function computeDiff(snapshot: Blueprint, current: Blueprint): string[] {
  const changes: string[] = [];

  for (const n of current.nodes) {
    if (!snapshot.nodes.find(sn => sn.id === n.id))
      changes.push(`+ "${n.label}" [${n.type}, ${n.status}] — added since checkpoint`);
  }
  for (const sn of snapshot.nodes) {
    if (!current.nodes.find(n => n.id === sn.id))
      changes.push(`- "${sn.label}" [${sn.type}, ${sn.status}] — removed since checkpoint`);
  }
  for (const sn of snapshot.nodes) {
    const cn = current.nodes.find(n => n.id === sn.id);
    if (!cn) continue;
    const diffs: string[] = [];
    if (sn.status      !== cn.status)      diffs.push(`status ${cn.status} → ${sn.status}`);
    if (sn.type        !== cn.type)        diffs.push(`type ${cn.type} → ${sn.type}`);
    if (sn.label       !== cn.label)       diffs.push(`label "${cn.label}" → "${sn.label}"`);
    if (sn.priority    !== cn.priority)    diffs.push(`priority ${cn.priority ?? 'none'} → ${sn.priority ?? 'none'}`);
    if (sn.description !== cn.description) diffs.push(`description changed`);
    if ((sn.notes ?? '') !== (cn.notes ?? '')) diffs.push(`notes changed`);
    if (diffs.length) changes.push(`~ "${cn.label}" — ${diffs.join(', ')}`);
  }
  for (const e of current.edges) {
    if (!snapshot.edges.find(se => se.id === e.id)) {
      const src = current.nodes.find(n => n.id === e.source)?.label ?? e.source;
      const tgt = current.nodes.find(n => n.id === e.target)?.label ?? e.target;
      changes.push(`+ edge ${src} → ${tgt} — added since checkpoint`);
    }
  }
  for (const se of snapshot.edges) {
    if (!current.edges.find(e => e.id === se.id)) {
      const src = snapshot.nodes.find(n => n.id === se.source)?.label ?? se.source;
      const tgt = snapshot.nodes.find(n => n.id === se.target)?.label ?? se.target;
      changes.push(`- edge ${src} → ${tgt} — removed since checkpoint`);
    }
  }
  return changes.length > 0 ? changes : ['No changes since checkpoint'];
}

export class BlueprintStore {
  private filePath: string;
  private blueprint: Blueprint;
  private changeListeners: (() => void)[] = [];
  private saveListeners: ((ts: string) => void)[] = [];
  private externalChangeListeners: ((ts: string) => void)[] = [];
  private watcher: fs.FSWatcher | undefined;
  private ignoreNextWatch = false;
  private snapshotDir: string;
  private nextSnapshotSlot = 0;
  private cachedDiff: { key: string; diff: string[] } | undefined;

  constructor(storageDir: string, projectName: string) {
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
    this.filePath    = path.join(storageDir, 'blueprint.json');
    this.snapshotDir = storageDir;
    this.blueprint   = this.load(projectName);
    this.migrateSeq();
    this.initSnapshotSlot();
  }

  private migrateSeq() {
    if (this.blueprint.nextSeq) return;
    const sorted = [...this.blueprint.nodes].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    sorted.forEach((n, i) => {
      const node = this.blueprint.nodes.find(x => x.id === n.id)!;
      if (!node.seq) node.seq = i + 1;
    });
    this.blueprint.nextSeq = this.blueprint.nodes.length + 1;
    this.save();
  }

  private load(projectName?: string): Blueprint {
    if (fs.existsSync(this.filePath)) {
      try { return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')); } catch {}
    }
    const fresh: Blueprint = {
      version: '1.0', project: projectName ?? '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      nodes: [], edges: [],
    };
    fs.writeFileSync(this.filePath, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }

  private save() {
    this.blueprint.updated_at = new Date().toISOString();
    this.ignoreNextWatch = true;
    fs.writeFileSync(this.filePath, JSON.stringify(this.blueprint, null, 2), 'utf-8');
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.saveListeners.forEach(fn => fn(ts));
    this.changeListeners.forEach(fn => fn());
  }

  watchExternal() {
    try {
      this.watcher = fs.watch(this.filePath, () => {
        if (this.ignoreNextWatch) { this.ignoreNextWatch = false; return; }
        try {
          const fresh = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
          this.blueprint = fresh;
          this.changeListeners.forEach(fn => fn());
          const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          this.externalChangeListeners.forEach(fn => fn(ts));
        } catch {}
      });
    } catch (err: any) {
      console.error('Blueprint: could not watch file —', err.message);
    }
  }

  onChange(fn: () => void)                  { this.changeListeners.push(fn); }
  onSave(fn: (ts: string) => void)          { this.saveListeners.push(fn); }
  onExternalChange(fn: (ts: string) => void){ this.externalChangeListeners.push(fn); }
  getBlueprint(): Blueprint         { return this.blueprint; }
  getFilePath(): string             { return this.filePath; }

  // ── Node ops ─────────────────────────────────────────────────────────────────
  addNode(fields: Omit<BlueprintNode, 'id' | 'created_at' | 'updated_at'>): BlueprintNode {
    const seq = this.blueprint.nextSeq ?? (this.blueprint.nodes.length + 1);
    this.blueprint.nextSeq = seq + 1;
    const node: BlueprintNode = {
      ...fields, id: uuidv4(), seq,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    this.blueprint.nodes.push(node);
    this.appendChangelog('added', node.label, `${node.type}, ${node.status}`);
    this.save();
    return node;
  }

  updateNode(id: string, fields: Partial<BlueprintNode>): BlueprintNode | null {
    const idx = this.blueprint.nodes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    const before = this.blueprint.nodes[idx];
    this.blueprint.nodes[idx] = { ...before, ...fields, id, updated_at: new Date().toISOString() };
    if (fields.status || fields.type || fields.label) {
      const changes: string[] = [];
      if (fields.status && fields.status !== before.status) changes.push(`status: ${before.status} → ${fields.status}`);
      if (fields.type   && fields.type   !== before.type)   changes.push(`type: ${before.type} → ${fields.type}`);
      if (fields.label  && fields.label  !== before.label)  changes.push(`label: "${before.label}" → "${fields.label}"`);
      if (changes.length) this.appendChangelog('updated', before.label, changes.join(', '));
    }
    this.save();
    return this.blueprint.nodes[idx];
  }

  removeNode(id: string): boolean {
    const node = this.blueprint.nodes.find(n => n.id === id);
    const before = this.blueprint.nodes.length;
    this.blueprint.nodes = this.blueprint.nodes.filter(n => n.id !== id);
    this.blueprint.edges = this.blueprint.edges.filter(e => e.source !== id && e.target !== id);
    if (this.blueprint.nodes.length === before) return false;
    if (node) this.appendChangelog('removed', node.label, `${node.type}, ${node.status}`);
    this.save();
    return true;
  }

  getNode(id: string): BlueprintNode | undefined {
    return this.blueprint.nodes.find(n => n.id === id);
  }

  // ── Edge ops ─────────────────────────────────────────────────────────────────
  addEdge(source: string, target: string, label?: string): BlueprintEdge {
    const exists = this.blueprint.edges.find(e => e.source === source && e.target === target);
    if (exists) return exists;
    const edge: BlueprintEdge = { id: uuidv4(), source, target, label };
    this.blueprint.edges.push(edge);
    this.save();
    return edge;
  }

  removeEdge(id: string): boolean {
    const before = this.blueprint.edges.length;
    this.blueprint.edges = this.blueprint.edges.filter(e => e.id !== id);
    this.save();
    return this.blueprint.edges.length < before;
  }

  // ── Import / Export ──────────────────────────────────────────────────────────
  exportData(): string { return JSON.stringify(this.blueprint, null, 2); }

  importData(json: string): void {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error('Invalid blueprint: file must contain nodes and edges arrays.');
    }
    this.blueprint = parsed as Blueprint;
    this.cachedDiff = undefined;
    this.save();
  }

  reset(projectName: string) {
    this.blueprint = {
      version: '1.0', project: projectName,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      nodes: [], edges: [],
    };
    this.save();
  }

  // ── Snapshot / undo ──────────────────────────────────────────────────────────
  private initSnapshotSlot() {
    for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
      if (!fs.existsSync(path.join(this.snapshotDir, `snapshot-${i}.json`))) {
        this.nextSnapshotSlot = i; return;
      }
    }
    // All slots exist — point nextSlot at the oldest one
    let times: { slot: number; time: number }[] = [];
    for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(this.snapshotDir, `snapshot-${i}.json`), 'utf-8'));
        times.push({ slot: i, time: d._snapshot_time ? new Date(d._snapshot_time).getTime() : 0 });
      } catch { this.nextSnapshotSlot = i; return; }
    }
    times.sort((a, b) => a.time - b.time);
    this.nextSnapshotSlot = times[0].slot;
  }

  saveSnapshot(): SnapshotInfo {
    const slot = this.nextSnapshotSlot;
    const time = new Date().toISOString();
    const snap = { ...this.blueprint, _snapshot_time: time };
    fs.writeFileSync(path.join(this.snapshotDir, `snapshot-${slot}.json`), JSON.stringify(snap, null, 2), 'utf-8');
    this.nextSnapshotSlot = (slot + 1) % SNAPSHOT_SLOTS;
    this.cachedDiff = undefined;
    this.appendChangelog('checkpoint', 'Snapshot saved', `slot ${slot}`);
    return { slot, time };
  }

  getSnapshotInfos(): SnapshotInfo[] {
    const infos: SnapshotInfo[] = [];
    for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
      const p = path.join(this.snapshotDir, `snapshot-${i}.json`);
      if (!fs.existsSync(p)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (d._snapshot_time) infos.push({ slot: i, time: d._snapshot_time });
      } catch {}
    }
    return infos.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }

  getDiffFromNewestSnapshot(): string[] {
    const infos = this.getSnapshotInfos();
    if (!infos.length) return [];
    const cacheKey = infos[0].time + ':' + this.blueprint.updated_at;
    if (this.cachedDiff?.key === cacheKey) return this.cachedDiff.diff;
    const p = path.join(this.snapshotDir, `snapshot-${infos[0].slot}.json`);
    try {
      const { _snapshot_time, ...snap } = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const diff = computeDiff(snap as Blueprint, this.blueprint);
      this.cachedDiff = { key: cacheKey, diff };
      return diff;
    } catch { return []; }
  }

  restoreSnapshot(slot: number): string[] {
    const p = path.join(this.snapshotDir, `snapshot-${slot}.json`);
    if (!fs.existsSync(p)) return [];
    try {
      const { _snapshot_time, ...snap } = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const changes = computeDiff(snap as Blueprint, this.blueprint);
      this.blueprint = {
        ...(snap as Blueprint),
        undo_pending: true,
        undo_diff: { snapshot_time: _snapshot_time, changes },
      };
      this.cachedDiff = undefined;
      this.appendChangelog('restored', 'Rolled back to checkpoint', `slot ${slot}, ${changes.length} change(s)`);
      this.save();
      return changes;
    } catch { return []; }
  }

  // ── Changelog ────────────────────────────────────────────────────────────────
  appendChangelog(action: string, label: string, details?: string) {
    const logPath = path.join(this.snapshotDir, 'changelog.json');
    let log: { entries: Array<{ time: string; action: string; label: string; details?: string }> } = { entries: [] };
    if (fs.existsSync(logPath)) {
      try { log = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch {}
    }
    log.entries.push({ time: new Date().toISOString(), action, label, details });
    if (log.entries.length > CHANGELOG_CAP) log.entries = log.entries.slice(-CHANGELOG_CAP);
    try { fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8'); } catch {}
  }

  dispose() { this.watcher?.close(); }
}
