import React, { useState } from 'react';
import { BlueprintNode, NodeType, NodeStatus, NodePriority } from '../../src/types';
import { TYPE_COLORS, PRIORITY_COLORS, STATUS_COLORS } from './constants';

interface Props {
  onAdd: (fields: Omit<BlueprintNode, 'id' | 'created_at' | 'updated_at'>) => void;
  onClose: () => void;
  nodeCount: number;
}

const NODE_TYPES: NodeType[] = ['feature','component','decision','dependency','research','todo','done','problem','note'];
const NODE_STATUSES: NodeStatus[] = ['planned','in-progress','done','blocked'];
const NODE_PRIORITIES: NodePriority[] = ['high','medium','low'];

const TYPE_DESCRIPTIONS: Record<NodeType, string> = {
  feature:    'A user-facing capability or product feature',
  component:  'A code module, service, or architectural piece',
  decision:   'An architectural or design decision with rationale',
  dependency: 'An external library, service, or system dependency',
  research:   'Something that needs investigation or prototyping',
  todo:       'A task or action item to complete',
  done:       'A completed item for reference',
  problem:    'A bug, issue, or blocker that needs resolution',
  note:       'A reference note, context, or documentation item',
};

export function AddNodePanel({ onAdd, onClose, nodeCount }: Props) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<NodeType>('component');
  const [status, setStatus] = useState<NodeStatus>('planned');
  const [priority, setPriority] = useState<NodePriority | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!label.trim())       { setError('Label is required'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    const col = nodeCount % 4;
    const row = Math.floor(nodeCount / 4);
    onAdd({ label:label.trim(), type, status, priority, description:description.trim(),
      notes:notes.trim()||undefined, file_path:filePath.trim()||undefined,
      source: 'user',
      position:{ x:100+col*280, y:80+row*200 } });
  };

  const color = TYPE_COLORS[type];

  return (
    <div style={{ width:360, height:'100vh', background:'#111827', borderLeft:'1px solid #1f2937', display:'flex', flexDirection:'column', overflowY:'auto', flexShrink:0 }}>
      <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid #1f2937', position:'sticky', top:0, background:'#111827', zIndex:1, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#f9fafb' }}>Add Node</div>
          <div style={{ fontSize:11, color:'#4b5563', marginTop:2 }}>New blueprint node</div>
        </div>
        <button onClick={onClose} style={iconBtn}>✕</button>
      </div>

      <div style={{ padding:16, flex:1, display:'flex', flexDirection:'column', gap:16 }}>
        <div>
          <label style={labelStyle}>Label *</label>
          <input value={label} onChange={e => { setLabel(e.target.value); setError(''); }}
            placeholder="e.g. Auth Service, User Login, API Gateway…"
            style={inputStyle} autoFocus onKeyDown={e => e.key==='Enter'&&handleSubmit()} />
        </div>

        <div>
          <label style={labelStyle}>Type</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {NODE_TYPES.map(t => (
              <button key={t} onClick={() => setType(t)} title={TYPE_DESCRIPTIONS[t]} style={{
                background:type===t?TYPE_COLORS[t]+'33':'transparent',
                color:type===t?TYPE_COLORS[t]:'#6b7280',
                border:`1px solid ${type===t?TYPE_COLORS[t]:'#374151'}`,
                borderRadius:4, padding:'3px 10px', fontSize:10, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer',
              }}>{t}</button>
            ))}
          </div>
          <div style={{ fontSize:10, color:'#4b5563', marginTop:4, fontStyle:'italic' }}>{TYPE_DESCRIPTIONS[type]}</div>
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {NODE_STATUSES.map(s => (
              <button key={s} onClick={() => setStatus(s)} style={{
                background:status===s?STATUS_COLORS[s]+'33':'transparent',
                color:status===s?STATUS_COLORS[s]:'#6b7280',
                border:`1px solid ${status===s?STATUS_COLORS[s]:'#374151'}`,
                borderRadius:4, padding:'3px 10px', fontSize:10, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer',
              }}>{s}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Priority</label>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {NODE_PRIORITIES.map(p => {
              const col = PRIORITY_COLORS[p];
              const active = priority === p;
              return (
                <button key={p} onClick={() => setPriority(active ? undefined : p)} style={{
                  background: active ? col+'33' : 'transparent',
                  color: active ? col : '#6b7280',
                  border: `1px solid ${active ? col : '#374151'}`,
                  borderRadius:4, padding:'3px 10px', fontSize:10, fontWeight:700,
                  textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer',
                }}>{p}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description *</label>
          <textarea value={description} onChange={e => { setDescription(e.target.value); setError(''); }}
            placeholder="What is this? Why does it exist? How does it work?"
            style={{ ...textareaStyle, minHeight:120 }} />
        </div>

        <div>
          <label style={labelStyle}>Notes / Open Questions</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Scratch pad — temporary thoughts, alternatives considered…"
            style={{ ...textareaStyle, minHeight:72 }} />
        </div>

        <div>
          <label style={labelStyle}>File Path</label>
          <input value={filePath} onChange={e => setFilePath(e.target.value)}
            placeholder="src/services/auth.ts" style={inputStyle} />
        </div>

        {/* Preview */}
        <div style={{ background:'#0d0d14', borderRadius:8, padding:'10px 14px', border:`1.5px solid ${color}44` }}>
          <div style={{ fontSize:10, color:'#4b5563', marginBottom:6, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em' }}>Preview</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <span style={{ background:color+'22', color, borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{type}</span>
            <span style={{ fontSize:10, color:STATUS_COLORS[status], marginLeft:'auto' }}>
              {status==='done'?'✓':status==='in-progress'?'⟳':status==='blocked'?'✗':'○'} {status}
            </span>
          </div>
          <div style={{ fontWeight:600, fontSize:13, color:label?'#f9fafb':'#374151', marginBottom:4 }}>{label||'Node label…'}</div>
          {filePath && <div style={{ fontSize:10, color:'#6b7280', fontFamily:'monospace', marginBottom:4 }}>{filePath}</div>}
          <div style={{ fontSize:11, color:'#9ca3af', lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {description||<span style={{ color:'#374151', fontStyle:'italic' }}>Description…</span>}
          </div>
        </div>

        {error && <div style={{ color:'#ef4444', fontSize:12, fontWeight:600 }}>{error}</div>}

        <div style={{ display:'flex', gap:8, marginTop:'auto' }}>
          <button onClick={onClose} style={{ flex:1, padding:'8px', background:'transparent', color:'#6b7280', border:'1px solid #374151', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!label.trim()||!description.trim()} style={{
            flex:2, padding:'8px',
            background:(!label.trim()||!description.trim())?'#1f2937':color+'22',
            color:(!label.trim()||!description.trim())?'#374151':color,
            border:`1px solid ${(!label.trim()||!description.trim())?'#374151':color+'88'}`,
            borderRadius:6, cursor:(!label.trim()||!description.trim())?'default':'pointer', fontSize:12, fontWeight:700,
          }}>Add Node</button>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = { background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:14, padding:4, lineHeight:1, flexShrink:0 };
const labelStyle: React.CSSProperties = { display:'block', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#4b5563', marginBottom:6 };
const inputStyle: React.CSSProperties = { width:'100%', background:'#0d0d14', color:'#d1d5db', border:'1px solid #374151', borderRadius:6, padding:'7px 10px', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', outline:'none' };
const textareaStyle: React.CSSProperties = { width:'100%', background:'#0d0d14', color:'#d1d5db', border:'1px solid #374151', borderRadius:6, padding:8, fontSize:12, lineHeight:1.6, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' };
