import React, { useCallback, useEffect, useRef, useState } from 'react';
import dagre from 'dagre';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  Node, Edge, Connection, NodeTypes, BackgroundVariant,
  Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Blueprint, BlueprintNode, BlueprintEdge, NodeType, NodeStatus } from '../../src/types';
import { TYPE_COLORS, PRIORITY_COLORS, STATUS_COLORS } from './constants';
import { NodeCard } from './NodeCard';
import { AddNodePanel } from './AddNodePanel';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
};
const vscode = acquireVsCodeApi();

// ── Colours ───────────────────────────────────────────────────────────────────
const STATUS_OPACITY: Record<NodeStatus, number> = {
  'planned':     0.5,
  'in-progress': 1.0,
  'done':        0.6,
  'blocked':     0.8,
};

// ── Flow converters ───────────────────────────────────────────────────────────
function toFlowNode(n: BlueprintNode, selected: boolean): Node {
  return {
    id: n.id, position: n.position, type: 'blueprint', selected,
    data: { blueprint: n },
    style: { opacity: STATUS_OPACITY[n.status] },
  };
}

function toFlowEdge(e: BlueprintEdge): Edge {
  return {
    id: e.id, source: e.source, target: e.target, label: e.label,
    animated: true,
    style: { stroke: '#4b5563', strokeWidth: 1.5 },
    labelStyle: { fill: '#9ca3af', fontSize: 10 },
    labelBgStyle: { fill: '#0d0d14' },
  };
}

// ── Node renderer ─────────────────────────────────────────────────────────────
function BlueprintNodeComponent({ data, selected }: { data: { blueprint: BlueprintNode }; selected: boolean }) {
  const n = data.blueprint;
  const color = TYPE_COLORS[n.type] ?? '#6b7280';
  return (
    <div style={{
      position: 'relative',
      background: '#111827', border: `1.5px solid ${selected ? color : '#374151'}`,
      borderRadius: 8, padding: '10px 14px', minWidth: 180, maxWidth: 260,
      boxShadow: selected ? `0 0 0 2px ${color}44` : 'none', cursor: 'pointer',
    }}>
      {/* User-created badge — top-left corner */}
      {n.source === 'user' && (
        <div style={{
          position: 'absolute', top: -7, left: -7,
          background: '#f59e0b', color: '#000',
          borderRadius: '50%', width: 16, height: 16,
          fontSize: 8, fontWeight: 900, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #0d0d14', zIndex: 2,
        }}>U</div>
      )}
      <Handle type="target" position={Position.Top}
        style={{ background: color, border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: color, border: 'none', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {/* Priority dot */}
        {n.priority && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
            background: PRIORITY_COLORS[n.priority],
            boxShadow: `0 0 4px ${PRIORITY_COLORS[n.priority]}99`,
          }} />
        )}
        <span style={{ background: color+'22', color, borderRadius: 4, padding: '1px 6px',
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {n.type}
        </span>
        <span style={{ fontSize: 10, marginLeft: 'auto',
          color: n.status === 'done' ? '#22c55e' : n.status === 'in-progress' ? '#f59e0b'
               : n.status === 'blocked' ? '#ef4444' : '#6b7280' }}>
          {n.status === 'done' ? '✓' : n.status === 'in-progress' ? '⟳' : n.status === 'blocked' ? '✗' : '○'}{' '}{n.status}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#f9fafb', marginBottom: 4 }}>{n.label}</div>
      {n.file_path && (
        <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', marginBottom: 4 }}>{n.file_path}</div>
      )}
      <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {n.description}
      </div>
    </div>
  );
}

// ── Layout modes ──────────────────────────────────────────────────────────────
type LayoutMode = 'TB' | 'LR' | 'Radial' | 'Grid';
const LAYOUT_OPTIONS: { mode: LayoutMode; label: string; icon: string }[] = [
  { mode: 'TB',     label: 'Tree ↓',  icon: '⬇' },
  { mode: 'LR',     label: 'Tree →',  icon: '➡' },
  { mode: 'Radial', label: 'Radial',  icon: '◎' },
  { mode: 'Grid',   label: 'Grid',    icon: '⊞' },
];

function computeLayoutDagre(nodes: BlueprintNode[], edges: BlueprintEdge[], dir: 'TB'|'LR'): Map<string,{x:number;y:number}> {
  if (!nodes.length) return new Map();
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: dir, nodesep: dir==='TB'?60:80, ranksep: dir==='TB'?120:200, marginx:40, marginy:40 });
  nodes.forEach(n => g.setNode(n.id, { width: 240, height: 110 }));
  edges.forEach(e => { try { g.setEdge(e.source, e.target); } catch {} });
  dagre.layout(g);
  const pos = new Map<string,{x:number;y:number}>();
  nodes.forEach(n => { const gn = g.node(n.id); if (gn) pos.set(n.id, { x: gn.x-120, y: gn.y-55 }); });
  return pos;
}

function bfsLayers(nodes: BlueprintNode[], edges: BlueprintEdge[]): Map<number,string[]> {
  const inDeg = new Map<string,number>(nodes.map(n => [n.id,0]));
  const adj   = new Map<string,string[]>(nodes.map(n => [n.id,[]]));
  edges.forEach(e => {
    if (inDeg.has(e.target)) inDeg.set(e.target, inDeg.get(e.target)!+1);
    if (adj.has(e.source))   adj.get(e.source)!.push(e.target);
  });
  const layer = new Map<string,number>(nodes.map(n => [n.id,0]));
  const rem   = new Map(inDeg);
  const queue = nodes.filter(n => inDeg.get(n.id)===0).map(n => n.id);
  while (queue.length) {
    const id=queue.shift()!; const cur=layer.get(id)!;
    for (const nb of adj.get(id)??[]) {
      if (layer.get(nb)!<cur+1) layer.set(nb,cur+1);
      rem.set(nb,rem.get(nb)!-1);
      if (rem.get(nb)===0) queue.push(nb);
    }
  }
  const groups = new Map<number,string[]>();
  nodes.forEach(n => { const l=layer.get(n.id)??0; if (!groups.has(l)) groups.set(l,[]); groups.get(l)!.push(n.id); });
  return groups;
}

function computeLayoutRadial(nodes: BlueprintNode[], edges: BlueprintEdge[]): Map<string,{x:number;y:number}> {
  if (!nodes.length) return new Map();
  const groups = bfsLayers(nodes, edges);
  const pos = new Map<string,{x:number;y:number}>();
  const NODE_W = 280;   // min spacing between node centres on a ring
  const BASE_R = 600;   // minimum radius for layer 1
  const R_STEP = 550;   // additional radius per layer beyond layer 1
  groups.forEach((ids, layerNum) => {
    if (layerNum === 0) {
      // roots spread horizontally
      ids.forEach((id, i) => pos.set(id, { x: (i - (ids.length - 1) / 2) * 560, y: 0 }));
    } else {
      // radius is whichever is larger: the fixed stepped value, or enough to
      // space all nodes on the circumference without overlapping
      const minForCount = (ids.length * NODE_W) / (2 * Math.PI);
      const r = Math.max(BASE_R + R_STEP * (layerNum - 1), minForCount);
      ids.forEach((id, i) => {
        const a = (2 * Math.PI * i / ids.length) - Math.PI / 2;
        pos.set(id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
      });
    }
  });
  return pos;
}

function computeLayoutGrid(nodes: BlueprintNode[]): Map<string,{x:number;y:number}> {
  if (!nodes.length) return new Map();
  const cols=Math.ceil(Math.sqrt(nodes.length*1.6));
  const sorted=[...nodes].sort((a,b)=>a.type.localeCompare(b.type)||a.label.localeCompare(b.label));
  const pos = new Map<string,{x:number;y:number}>();
  sorted.forEach((n,i) => pos.set(n.id,{x:(i%cols)*280,y:Math.floor(i/cols)*160}));
  return pos;
}

function computeLayout(nodes: BlueprintNode[], edges: BlueprintEdge[], mode: LayoutMode): Map<string,{x:number;y:number}> {
  switch(mode) {
    case 'TB':     return computeLayoutDagre(nodes,edges,'TB');
    case 'LR':     return computeLayoutDagre(nodes,edges,'LR');
    case 'Radial': return computeLayoutRadial(nodes,edges);
    case 'Grid':   return computeLayoutGrid(nodes);
  }
}

const NODE_TYPES: NodeTypes = { blueprint: BlueprintNodeComponent as any };

// ── Autosave indicator ────────────────────────────────────────────────────────
type SaveState = 'saving' | 'saved' | 'idle';

function AutosaveIndicator({ state, timestamp }: { state: SaveState; timestamp: string }) {
  const color = state === 'idle' ? '#4b5563' : '#22c55e';
  const label = state === 'saving' ? '⟳ saving…'
              : state === 'saved'  ? '✓ Saved'
              : `✓ ${timestamp}`;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      transition: 'color 0.3s',
      opacity: state === 'idle' ? 0.6 : 1,
      minWidth: 90,
    }}>
      {label}
    </span>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [selectedNode, setSelectedNode] = useState<BlueprintNode | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('TB');
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveTimestamp, setSaveTimestamp] = useState('');
  const [legendFilter, setLegendFilter] = useState<NodeType | null>(null);
  const [legendScroll, setLegendScroll] = useState(0);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [snapshots, setSnapshots] = useState<{slot: number; time: string}[]>([]);
  const [undoDiff, setUndoDiff] = useState<string[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const blueprintRef = useRef<Blueprint | null>(null);
  const layoutModeRef = useRef<LayoutMode>('TB');
  const { setCenter, getZoom } = useReactFlow();

  // Stable refs so the mousedown listener never needs to be re-attached
  const setCenterRef = useRef(setCenter);
  const getZoomRef   = useRef(getZoom);
  setCenterRef.current = setCenter;
  getZoomRef.current   = getZoom;

  // Minimap: jump to clicked position immediately on mousedown (not mouseup).
  // Depends on minimapVisible so the listener is re-attached every time the
  // minimap is toggled back on (it unmounts/remounts, killing the old listener).
  // capture:true fires before React Flow's own pannable handler.
  useEffect(() => {
    if (!minimapVisible) return;
    let removeListener: (() => void) | undefined;

    const timer = setTimeout(() => {
      const minimap = document.querySelector('.react-flow__minimap');
      const svg     = minimap?.querySelector('svg') as SVGSVGElement | null;
      if (!minimap || !svg) return;

      const onMouseDown = (e: MouseEvent) => {
        const rect = svg.getBoundingClientRect();
        const vb   = svg.viewBox.baseVal;
        if (!vb.width || !vb.height) return;
        const x = vb.x + ((e.clientX - rect.left) / rect.width)  * vb.width;
        const y = vb.y + ((e.clientY - rect.top)  / rect.height) * vb.height;
        setCenterRef.current(x, y, { duration: 0, zoom: getZoomRef.current() });
      };

      minimap.addEventListener('mousedown', onMouseDown, { capture: true });
      removeListener = () => minimap.removeEventListener('mousedown', onMouseDown, { capture: true });
    }, 0);

    return () => {
      clearTimeout(timer);
      removeListener?.();
    };
  }, [minimapVisible]); // re-attach whenever minimap mounts/unmounts

  const applyBlueprint = useCallback((b: Blueprint) => {
    setBlueprint(b);
    blueprintRef.current = b;
    setNodes(b.nodes.map(n => toFlowNode(n, false)));
    setEdges(b.edges.map(e => toFlowEdge(e)));
  }, [setNodes, setEdges]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init':
        case 'full-refresh': {
          applyBlueprint(msg.blueprint);
          if (msg.blueprint.nodes.length > 0) {
            // Only layout nodes whose position is still at origin (0,0) — never been saved.
            // This preserves manually dragged/laid-out positions across reloads.
            const unpositioned = msg.blueprint.nodes.filter(n => n.position.x === 0 && n.position.y === 0);
            const allUnpositioned = unpositioned.length === msg.blueprint.nodes.length;
            if (allUnpositioned) {
              // Fresh blueprint — layout everything
              const positions = computeLayout(msg.blueprint.nodes, msg.blueprint.edges, layoutModeRef.current);
              setNodes(prev => prev.map(n => { const pos = positions.get(n.id); return pos ? {...n, position: pos} : n; }));
            } else if (unpositioned.length > 0) {
              // Partially positioned — only move the new (0,0) nodes
              const positions = computeLayout(msg.blueprint.nodes, msg.blueprint.edges, layoutModeRef.current);
              setNodes(prev => prev.map(n => {
                const bp = msg.blueprint.nodes.find((bn: BlueprintNode) => bn.id === n.id);
                if (bp && bp.position.x === 0 && bp.position.y === 0) {
                  const pos = positions.get(n.id);
                  return pos ? {...n, position: pos} : n;
                }
                return n; // keep saved position
              }));
            }
            // else: all nodes have saved positions — use them as-is (no layout override)
          }
          break;
        }
        case 'node-updated': {
          const updated = msg.node;
          const updatedBp = {
            ...blueprintRef.current!,
            nodes: blueprintRef.current!.nodes.map(n => n.id === updated.id ? updated : n),
          };
          blueprintRef.current = updatedBp;
          setBlueprint(updatedBp);
          setNodes(prev => prev.map(n => n.id === updated.id ? toFlowNode(updated, n.selected ?? false) : n));
          if (selectedNode?.id === updated.id) setSelectedNode(updated);
          break;
        }
        case 'node-added': {
          const added = msg.node;
          const updatedBp = {
            ...blueprintRef.current!,
            nodes: [...blueprintRef.current!.nodes.filter(n => n.id !== added.id), added],
          };
          blueprintRef.current = updatedBp;
          setBlueprint(updatedBp);
          const newFlowNode = toFlowNode(added, false);
          if (added.position.x === 0 && added.position.y === 0) {
            const positions = computeLayout(updatedBp.nodes, updatedBp.edges, layoutModeRef.current);
            const pos = positions.get(added.id);
            if (pos) newFlowNode.position = pos;
          }
          setNodes(prev => [...prev.filter(n => n.id !== added.id), newFlowNode]);
          break;
        }
        case 'node-removed':
          applyBlueprint({ ...blueprintRef.current!, nodes: blueprintRef.current!.nodes
            .filter(n => n.id !== msg.id), edges: blueprintRef.current!.edges
            .filter(e => e.source !== msg.id && e.target !== msg.id) });
          if (selectedNode?.id === msg.id) setSelectedNode(null);
          break;
        case 'edge-added':
          applyBlueprint({ ...blueprintRef.current!, edges: blueprintRef.current!.edges
            .filter(e => e.id !== msg.edge.id).concat(msg.edge) });
          break;
        case 'edge-removed':
          applyBlueprint({ ...blueprintRef.current!, edges: blueprintRef.current!.edges
            .filter(e => e.id !== msg.id) });
          break;
        case 'snapshot-state':
          setSnapshots(msg.snapshots ?? []);
          setUndoDiff(msg.diff ?? []);
          break;
        case 'save-status':
          clearTimeout(saveTimerRef.current);
          if (msg.state === 'saving') {
            setSaveState('saving');
          } else {
            setSaveTimestamp(msg.timestamp ?? '');
            setSaveState('saved');
            saveTimerRef.current = setTimeout(() => setSaveState('idle'), 1800);
          }
          break;
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [applyBlueprint, selectedNode]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode((node.data as { blueprint: BlueprintNode }).blueprint);
    setAddPanelOpen(false);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setLayoutMenuOpen(false);
    setLegendFilter(null);
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    vscode.postMessage({ type: 'add-edge', source: conn.source, target: conn.target });
  }, []);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    vscode.postMessage({ type: 'move-node', id: node.id, position: node.position });
  }, []);

  const handleUpdateNode = useCallback((id: string, fields: Partial<BlueprintNode>) => {
    vscode.postMessage({ type: 'update-node', id, fields });
  }, []);

  const handleRemoveNode = useCallback((id: string) => {
    vscode.postMessage({ type: 'remove-node', id });
    setSelectedNode(null);
  }, []);

  const handleAddNode = useCallback((fields: Omit<BlueprintNode, 'id'|'created_at'|'updated_at'>) => {
    vscode.postMessage({ type: 'add-node', node: fields });
    setAddPanelOpen(false);
  }, []);

  const handleRemoveEdge = useCallback((id: string) => {
    vscode.postMessage({ type: 'remove-edge', id });
  }, []);

  const handleAutoLayout = useCallback((mode: LayoutMode) => {
    layoutModeRef.current = mode;
    const b = blueprintRef.current;
    if (!b || !b.nodes.length) return;
    const positions = computeLayout(b.nodes, b.edges, mode);
    setNodes(prev => prev.map(n => { const pos=positions.get(n.id); return pos?{...n,position:pos}:n; }));
    positions.forEach((position, id) => vscode.postMessage({ type: 'move-node', id, position }));
    setLayoutMenuOpen(false);
  }, [setNodes]);

  const handleLegendClick = useCallback((type: NodeType) => {
    setLegendFilter(prev => prev === type ? null : type);
    setLegendScroll(0);
  }, []);

  const jumpToNode = useCallback((n: BlueprintNode) => {
    const flowNode = nodes.find(fn => fn.id === n.id);
    if (flowNode) {
      // Center on the middle of the node card (~240×110)
      setCenterRef.current(flowNode.position.x + 120, flowNode.position.y + 55, {
        duration: 350, zoom: getZoomRef.current(),
      });
    }
    setSelectedNode(n);
    setAddPanelOpen(false);
    setLegendFilter(null);
  }, [nodes]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#0d0d14' }}>
      <div style={{ flex: 1, position: 'relative' }}>

        {/* Toolbar */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10,
          display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, letterSpacing: '0.05em' }}>
            ◈ {blueprint?.project || 'Synapse'}
          </span>
          <span style={{ color: '#374151', fontSize: 12 }}>
            {blueprint ? `${blueprint.nodes.length} nodes · ${blueprint.edges.length} edges` : ''}
          </span>
          <button onClick={() => { setSelectedNode(null); setAddPanelOpen(o=>!o); }} style={toolbarBtn('#22c55e')}>
            + Add Node
          </button>

          {/* Layout dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setLayoutMenuOpen(o=>!o)} style={toolbarBtn('#a855f7')}>
              {LAYOUT_OPTIONS.find(o=>o.mode===layoutMode)?.icon} Layout ▾
            </button>
            {layoutMenuOpen && (
              <div style={{ position:'absolute', top:'110%', left:0, zIndex:50,
                background:'#1f2937', border:'1px solid #374151', borderRadius:8,
                padding:4, display:'flex', flexDirection:'column', gap:2, minWidth:130,
                boxShadow:'0 8px 24px #0009' }}>
                {LAYOUT_OPTIONS.map(opt => (
                  <button key={opt.mode}
                    onClick={() => { setLayoutMode(opt.mode); handleAutoLayout(opt.mode); }}
                    style={{ background: layoutMode===opt.mode ? '#a855f722':'transparent',
                      color: layoutMode===opt.mode ? '#a855f7':'#d1d5db',
                      border:'none', borderRadius:6, padding:'6px 10px',
                      fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'left' }}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <button onClick={() => vscode.postMessage({ type: 'export' })} style={toolbarBtn('#06b6d4')}>
            ↑ Export
          </button>

          {/* Import */}
          <button onClick={() => vscode.postMessage({ type: 'import' })} style={toolbarBtn('#d97706')}>
            ↓ Import
          </button>

          {/* Checkpoint badge — read-only indicator, not interactive */}
          {(() => {
            const hasSnap = snapshots.length > 0;
            const newest  = snapshots[0];
            const ts = hasSnap
              ? new Date(newest.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600,
                color: hasSnap ? '#f59e0b' : '#4b5563',
                opacity: hasSnap ? 1 : 0.45,
                userSelect: 'none',
              }}>
                <span style={{ fontSize: 13 }}>↩</span>
                <span>{hasSnap ? ts : '—'}</span>
              </span>
            );
          })()}

          {/* Autosave indicator */}
          <AutosaveIndicator state={saveState} timestamp={saveTimestamp} />
        </div>

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeClick={onNodeClick}
          onPaneClick={onPaneClick} onNodeDragStop={onNodeDragStop}
          nodeTypes={NODE_TYPES} fitView
          attributionPosition="bottom-right"
          style={{ background: '#0d0d14' }}
        >
          <Background variant={BackgroundVariant.Dots} color="#1f2937" gap={20} size={1} />
          {minimapVisible && <>
            <Controls position="bottom-right"
              style={{ background: '#111827', borderColor: '#374151', right: 218, bottom: 10 }} />
            <MiniMap position="bottom-right"
              style={{ background: '#111827', border: '1px solid #374151' }}
              nodeColor={(n) => TYPE_COLORS[(n.data as any)?.blueprint?.type] ?? '#6b7280'}
              maskColor="#0d0d1488" pannable zoomable />
          </>}
        </ReactFlow>

        {/* Minimap / controls toggle — always visible bottom-right */}
        <button
          onClick={() => setMinimapVisible(v => !v)}
          title={minimapVisible ? 'Hide minimap & controls' : 'Show minimap & controls'}
          style={{ position:'absolute', bottom:12, right:12, zIndex:10,
            background: minimapVisible ? '#1f2937' : '#111827',
            border:`1px solid ${minimapVisible ? '#374151' : '#374151'}`,
            borderRadius:6, color: minimapVisible ? '#9ca3af' : '#4b5563',
            fontSize:14, width:28, height:28, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            lineHeight:1, transition:'color 0.2s, background 0.2s' }}>
          {minimapVisible ? '⊡' : '⊞'}
        </button>

        {/* Legend — click any chip to open the node navigator popup */}
        <div style={{ position:'absolute', bottom:12, left:12, zIndex:10 }}>

          {/* Ascending popup panel */}
          {legendFilter && (() => {
            const typeColor  = TYPE_COLORS[legendFilter];
            const allOfType  = blueprint?.nodes.filter(n => n.type === legendFilter) ?? [];
            const VISIBLE    = 5;
            const maxScroll  = Math.max(0, allOfType.length - VISIBLE);
            const visible    = allOfType.slice(legendScroll, legendScroll + VISIBLE);
            const STATUS_DOT: Record<NodeStatus,string> = {
              planned:'#6b7280','in-progress':'#f59e0b',done:'#22c55e',blocked:'#ef4444',
            };
            const STATUS_ICON: Record<NodeStatus,string> = {
              planned:'○','in-progress':'⟳',done:'✓',blocked:'✗',
            };
            const PRIORITY_DOT: Record<string,string> = {
              high:'#ef4444', medium:'#f59e0b', low:'#22c55e',
            };
            return (
              <div
                onWheel={e => {
                  e.preventDefault();
                  setLegendScroll(s => Math.min(maxScroll, Math.max(0, s + (e.deltaY > 0 ? 1 : -1))));
                }}
                style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0,
                  background:'#111827', border:`1px solid ${typeColor}55`,
                  borderRadius:8, minWidth:260, boxShadow:'0 -4px 24px #0009',
                  overflow:'hidden' }}
              >
                {/* Header */}
                <div style={{ padding:'8px 12px', borderBottom:`1px solid ${typeColor}33`,
                  display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ background:typeColor+'22', color:typeColor, borderRadius:4,
                    padding:'2px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>
                    {legendFilter}
                  </span>
                  <span style={{ fontSize:11, color:'#6b7280', marginLeft:'auto' }}>
                    {legendScroll+1}–{Math.min(legendScroll+VISIBLE, allOfType.length)} of {allOfType.length}
                  </span>
                </div>

                {/* Node rows */}
                {allOfType.length === 0 ? (
                  <div style={{ padding:'12px', fontSize:12, color:'#4b5563', fontStyle:'italic' }}>
                    No {legendFilter} nodes
                  </div>
                ) : visible.map(n => (
                  <div key={n.id}
                    onClick={() => jumpToNode(n)}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                      cursor:'pointer', borderBottom:'1px solid #1f2937',
                      transition:'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Priority-colored dot (grey if no priority) */}
                    {(() => { const dc = n.priority ? PRIORITY_DOT[n.priority] : '#4b5563'; return (
                      <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                        background:dc, display:'inline-block',
                        boxShadow:`0 0 4px ${dc}88` }} />
                    ); })()}
                    {/* Node label */}
                    <span style={{ fontSize:12, color:'#e5e7eb', fontWeight:500, flex:1,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {n.label}
                    </span>
                    {/* User badge */}
                    {n.source === 'user' && (
                      <span style={{ fontSize:9, fontWeight:800, color:'#f59e0b',
                        background:'#f59e0b22', borderRadius:3, padding:'1px 5px',
                        border:'1px solid #f59e0b44', flexShrink:0 }}>U</span>
                    )}
                    {/* Status text */}
                    <span style={{ fontSize:10, color:STATUS_DOT[n.status], fontWeight:600,
                      whiteSpace:'nowrap', flexShrink:0 }}>
                      {STATUS_ICON[n.status]} {n.status}
                    </span>
                  </div>
                ))}

                {/* Scroll hint */}
                {allOfType.length > VISIBLE && (
                  <div style={{ padding:'4px 12px', fontSize:10, color:'#4b5563',
                    textAlign:'center', borderTop:'1px solid #1f2937' }}>
                    scroll ↑↓ to browse
                  </div>
                )}
              </div>
            );
          })()}

          {/* Chip bar — stacked vertically */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {(Object.entries(TYPE_COLORS) as [NodeType,string][]).map(([type,color]) => {
              const count   = blueprint?.nodes.filter(n => n.type === type).length ?? 0;
              const active  = legendFilter === type;
              return (
                <button key={type} onClick={() => handleLegendClick(type)}
                  style={{ background: active ? color+'44' : color+'22', color,
                    border:`1px solid ${active ? color : color+'44'}`,
                    borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:600,
                    textTransform:'uppercase', cursor:'pointer', display:'flex', gap:4,
                    alignItems:'center', outline:'none',
                    boxShadow: active ? `0 0 0 1px ${color}44` : 'none' }}>
                  {type}
                  {count > 0 && (
                    <span style={{ background:color+'33', borderRadius:3,
                      padding:'0 4px', fontSize:9, fontWeight:700 }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedNode && (
        <NodeCard node={selectedNode} edges={blueprint?.edges??[]} nodes={blueprint?.nodes??[]}
          onUpdate={handleUpdateNode} onRemove={handleRemoveNode}
          onRemoveEdge={handleRemoveEdge} onJumpTo={jumpToNode} onClose={() => setSelectedNode(null)} />
      )}
      {addPanelOpen && !selectedNode && (
        <AddNodePanel onAdd={handleAddNode} onClose={() => setAddPanelOpen(false)}
          nodeCount={blueprint?.nodes.length??0} />
      )}
    </div>
  );
}

function toolbarBtn(color: string): React.CSSProperties {
  return {
    background: color+'22', color, border: `1px solid ${color}44`,
    borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  };
}
