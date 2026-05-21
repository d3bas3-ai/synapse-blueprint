import React, { useState, useRef } from 'react';
import { BlueprintNode, BlueprintEdge, NodeType, NodeStatus, NodePriority } from '../../src/types';
import { TYPE_COLORS, PRIORITY_COLORS, STATUS_COLORS } from './constants';

interface Props {
  node: BlueprintNode;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  onUpdate: (id: string, fields: Partial<BlueprintNode>) => void;
  onRemove: (id: string) => void;
  onRemoveEdge: (id: string) => void;
  onJumpTo: (node: BlueprintNode) => void;
  onClose: () => void;
}


export function NodeCard({ node, nodes, edges, onUpdate, onRemove, onRemoveEdge, onJumpTo, onClose }: Props) {
  const [editLabel, setEditLabel] = useState(false);
  const [label, setLabel] = useState(node.label);
  const [editDesc, setEditDesc] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [editFilePath, setEditFilePath] = useState(false);
  const [desc, setDesc] = useState(node.description);
  const [notes, setNotes] = useState(node.notes ?? '');
  const [filePath, setFilePath] = useState(node.file_path ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmEdgeRemove, setConfirmEdgeRemove] = useState<string | null>(null);

  // Refs let external-update effects read current edit state without stale closures
  const editLabelRef    = useRef(false);
  const editDescRef     = useRef(false);
  const editNotesRef    = useRef(false);
  const editFilePathRef = useRef(false);
  editLabelRef.current    = editLabel;
  editDescRef.current     = editDesc;
  editNotesRef.current    = editNotes;
  editFilePathRef.current = editFilePath;

  // Full reset when switching to a different node
  React.useEffect(() => {
    setLabel(node.label); setDesc(node.description);
    setNotes(node.notes ?? ''); setFilePath(node.file_path ?? '');
    setEditLabel(false); setEditDesc(false); setEditNotes(false); setEditFilePath(false);
    setConfirmRemove(false); setConfirmEdgeRemove(null);
  }, [node.id]);

  // Protect in-flight edits from external LLM updates on the same node
  React.useEffect(() => {
    if (!editLabelRef.current)    setLabel(node.label);
    if (!editDescRef.current)     setDesc(node.description);
    if (!editNotesRef.current)    setNotes(node.notes ?? '');
    if (!editFilePathRef.current) setFilePath(node.file_path ?? '');
  }, [node.label, node.description, node.notes, node.file_path]);

  const incoming = edges.filter(e => e.target === node.id).map(e => ({ edge: e, node: nodes.find(n => n.id === e.source) }));
  const outgoing = edges.filter(e => e.source === node.id).map(e => ({ edge: e, node: nodes.find(n => n.id === e.target) }));
  const color = TYPE_COLORS[node.type] ?? '#6b7280';
  const statusColor = STATUS_COLORS[node.status];

  return (
    <div style={{ width:360, height:'100vh', background:'#111827', borderLeft:'1px solid #1f2937', display:'flex', flexDirection:'column', overflowY:'auto', flexShrink:0 }}>
      <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid #1f2937', position:'sticky', top:0, background:'#111827', zIndex:1 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap' }}>
              <span style={pill(color)}>{node.type}</span>
              <span style={pill(statusColor)}>{node.status}</span>
              {node.priority && (
                <span style={pill(PRIORITY_COLORS[node.priority])}>{node.priority}</span>
              )}
              {node.source === 'user' && (
                <span style={{ ...pill('#f59e0b'), border:'1px solid #f59e0b66' }}>U user</span>
              )}
            </div>
            {editLabel ? (
              <input value={label} onChange={e => setLabel(e.target.value)}
                onBlur={() => { onUpdate(node.id,{label}); setEditLabel(false); }}
                onKeyDown={e => { if(e.key==='Enter'){onUpdate(node.id,{label});setEditLabel(false);} if(e.key==='Escape'){setLabel(node.label);setEditLabel(false);} }}
                style={{ fontWeight:700, fontSize:15, color:'#f9fafb', background:'#0d0d14', border:'1px solid #374151', borderRadius:4, padding:'2px 6px', width:'100%', fontFamily:'inherit' }}
                autoFocus />
            ) : (
              <div onClick={() => setEditLabel(true)} style={{ fontWeight:700, fontSize:15, color:'#f9fafb', cursor:'text' }}>{node.label}</div>
            )}
            <div style={{ marginTop: 4 }}>
              {editFilePath ? (
                <input value={filePath}
                  onChange={e => setFilePath(e.target.value)}
                  onBlur={() => { onUpdate(node.id, { file_path: filePath.trim() || undefined }); setEditFilePath(false); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onUpdate(node.id, { file_path: filePath.trim() || undefined }); setEditFilePath(false); }
                    if (e.key === 'Escape') { setFilePath(node.file_path ?? ''); setEditFilePath(false); }
                  }}
                  placeholder="src/path/to/file.ts"
                  style={{ fontSize:10, color:'#9ca3af', fontFamily:'monospace', background:'#0d0d14', border:'1px solid #374151', borderRadius:4, padding:'2px 6px', width:'100%', boxSizing:'border-box' }}
                  autoFocus />
              ) : (
                <div onClick={() => setEditFilePath(true)}
                  style={{ fontSize:10, color: filePath ? '#6b7280' : '#374151', fontFamily:'monospace', cursor:'text', fontStyle: filePath ? 'normal' : 'italic' }}>
                  {filePath || 'click to add file path…'}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={iconBtn}>✕</button>
        </div>
        <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
          {(['planned','in-progress','done','blocked'] as NodeStatus[]).map(s => (
            <button key={s} onClick={() => onUpdate(node.id,{status:s})} style={{ ...pill(STATUS_COLORS[s]), cursor:'pointer', opacity:node.status===s?1:0.4, border:`1px solid ${STATUS_COLORS[s]}`, background:node.status===s?STATUS_COLORS[s]+'33':'transparent' }}>{s}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:6, marginTop:8, alignItems:'center' }}>
          <span style={{ fontSize:10, color:'#4b5563', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Priority</span>
          {(['high','medium','low'] as NodePriority[]).map(p => {
            const col = PRIORITY_COLORS[p];
            const active = node.priority === p;
            return (
              <button key={p} onClick={() => onUpdate(node.id, { priority: active ? undefined : p })}
                style={{ ...pill(col), cursor:'pointer', opacity:active?1:0.35, border:`1px solid ${col}`, background:active?col+'33':'transparent' }}>
                {p}
              </button>
            );
          })}
          {node.priority && (
            <button onClick={() => onUpdate(node.id, { priority: undefined })}
              style={{ marginLeft:'auto', background:'none', border:'none', color:'#4b5563', fontSize:10, cursor:'pointer' }}>
              clear
            </button>
          )}
        </div>
      </div>

      <div style={{ padding:16, flex:1, display:'flex', flexDirection:'column', gap:16 }}>
        <section>
          <div style={sectionLabel}>Type</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {(['feature','component','decision','dependency','research','todo','done','problem','note'] as NodeType[]).map(t => (
              <button key={t} onClick={() => onUpdate(node.id,{type:t})} style={{ ...pill(TYPE_COLORS[t]), cursor:'pointer', opacity:node.type===t?1:0.35, border:`1px solid ${TYPE_COLORS[t]}`, background:node.type===t?TYPE_COLORS[t]+'33':'transparent' }}>{t}</button>
            ))}
          </div>
        </section>

        <section>
          <div style={sectionLabel}>Description <button onClick={() => setEditDesc(e=>!e)} style={editToggle}>{editDesc?'Save':'Edit'}</button></div>
          {editDesc ? (
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => { onUpdate(node.id,{description:desc}); setEditDesc(false); }} style={textareaStyle} autoFocus />
          ) : (
            <div onClick={() => setEditDesc(true)} style={{ fontSize:12, color:'#d1d5db', lineHeight:1.6, whiteSpace:'pre-wrap', cursor:'text', minHeight:48 }}>
              {node.description || <span style={{ color:'#4b5563', fontStyle:'italic' }}>Click to add description…</span>}
            </div>
          )}
        </section>

        <section>
          <div style={sectionLabel}>Notes / Open Questions <button onClick={() => setEditNotes(e=>!e)} style={editToggle}>{editNotes?'Save':'Edit'}</button></div>
          {editNotes ? (
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => { onUpdate(node.id,{notes}); setEditNotes(false); }} style={textareaStyle} autoFocus />
          ) : (
            <div onClick={() => setEditNotes(true)} style={{ fontSize:12, color:'#9ca3af', lineHeight:1.6, whiteSpace:'pre-wrap', cursor:'text', minHeight:32 }}>
              {notes || <span style={{ color:'#374151', fontStyle:'italic' }}>Click to add notes…</span>}
            </div>
          )}
        </section>

        {(incoming.length>0||outgoing.length>0) && (
          <section>
            <div style={sectionLabel}>Connections</div>
            {incoming.map(({edge,node:src}) => src && (
              <div key={edge.id} style={connRow}>
                <span style={{ color:'#6b7280', fontSize:11 }}>← from</span>
                <button onClick={() => onJumpTo(src)} style={jumpBtn}>{src.label}</button>
                {edge.label && <span style={{ color:'#6b7280', fontSize:11, fontStyle:'italic' }}>{edge.label}</span>}
                {confirmEdgeRemove === edge.id ? (
                  <span style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    <button onClick={() => { onRemoveEdge(edge.id); setConfirmEdgeRemove(null); }} style={{ ...removeBtn, color:'#ef4444', fontWeight:700 }}>✓</button>
                    <button onClick={() => setConfirmEdgeRemove(null)} style={removeBtn}>✕</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmEdgeRemove(edge.id)} style={removeBtn}>✕</button>
                )}
              </div>
            ))}
            {outgoing.map(({edge,node:tgt}) => tgt && (
              <div key={edge.id} style={connRow}>
                <span style={{ color:'#6b7280', fontSize:11 }}>→ to</span>
                <button onClick={() => onJumpTo(tgt)} style={jumpBtn}>{tgt.label}</button>
                {edge.label && <span style={{ color:'#6b7280', fontSize:11, fontStyle:'italic' }}>{edge.label}</span>}
                {confirmEdgeRemove === edge.id ? (
                  <span style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    <button onClick={() => { onRemoveEdge(edge.id); setConfirmEdgeRemove(null); }} style={{ ...removeBtn, color:'#ef4444', fontWeight:700 }}>✓</button>
                    <button onClick={() => setConfirmEdgeRemove(null)} style={removeBtn}>✕</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmEdgeRemove(edge.id)} style={removeBtn}>✕</button>
                )}
              </div>
            ))}
          </section>
        )}

        <section>
          <div style={sectionLabel}>Metadata</div>
          <div style={{ fontSize:10, color:'#4b5563', lineHeight:2, fontFamily:'monospace' }}>
            <div>ID: {node.id}</div>
            <div>Created: {new Date(node.created_at).toLocaleString()}</div>
            <div>Updated: {new Date(node.updated_at).toLocaleString()}</div>
          </div>
        </section>

        <div style={{ marginTop:'auto' }}>
          {confirmRemove ? (
            <div style={{ background:'#1f0a0a', border:'1px solid #7f1d1d', borderRadius:6, padding:'10px 12px' }}>
              <div style={{ fontSize:12, color:'#ef4444', marginBottom:8, fontWeight:600 }}>Remove "{node.label}"?</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => onRemove(node.id)}
                  style={{ flex:1, padding:'6px', background:'#7f1d1d', color:'#fca5a5', border:'1px solid #ef4444', borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:700 }}>
                  Yes, Remove
                </button>
                <button onClick={() => setConfirmRemove(false)}
                  style={{ flex:1, padding:'6px', background:'transparent', color:'#9ca3af', border:'1px solid #374151', borderRadius:5, cursor:'pointer', fontSize:12 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmRemove(true)}
              style={{ width:'100%', padding:'8px', background:'#1f0a0a', color:'#ef4444', border:'1px solid #7f1d1d', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600 }}>
              Remove Node
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = { background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:14, padding:4, lineHeight:1, flexShrink:0 };
const sectionLabel: React.CSSProperties = { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#4b5563', marginBottom:8, display:'flex', alignItems:'center', gap:8 };
const textareaStyle: React.CSSProperties = { width:'100%', minHeight:100, background:'#0d0d14', color:'#d1d5db', border:'1px solid #374151', borderRadius:6, padding:8, fontSize:12, lineHeight:1.6, resize:'vertical', fontFamily:'inherit' };
const editToggle: React.CSSProperties = { marginLeft:'auto', background:'none', border:'1px solid #374151', color:'#9ca3af', borderRadius:4, padding:'1px 8px', fontSize:10, cursor:'pointer' };
const connRow: React.CSSProperties = { display:'flex', alignItems:'center', gap:6, padding:'4px 0', borderBottom:'1px solid #1f2937' };
const removeBtn: React.CSSProperties = { marginLeft:'auto', background:'none', border:'none', color:'#4b5563', cursor:'pointer', fontSize:11, padding:'0 2px' };
const jumpBtn: React.CSSProperties = { background:'none', border:'none', color:'#e5e7eb', cursor:'pointer', fontSize:12, fontWeight:500, padding:0, textAlign:'left', textDecoration:'underline', textDecorationColor:'#374151', textUnderlineOffset:2 };
function pill(color: string): React.CSSProperties { return { background:color+'22', color, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', display:'inline-block' }; }
