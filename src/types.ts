export type NodeType =
  | 'feature'
  | 'component'
  | 'decision'
  | 'dependency'
  | 'research'
  | 'todo'
  | 'done'
  | 'problem'
  | 'note';

export type NodeStatus   = 'planned' | 'in-progress' | 'done' | 'blocked';
export type NodePriority = 'high' | 'medium' | 'low';

export interface BlueprintNode {
  id: string;
  seq?: number;        // stable creation-order number, never changes after assignment
  label: string;
  type: NodeType;
  status: NodeStatus;
  priority?: NodePriority;
  source?: 'user' | 'llm';
  description: string;
  notes?: string;
  file_path?: string;
  position: { x: number; y: number };
  created_at: string;
  updated_at: string;
}

export interface BlueprintEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface SnapshotInfo {
  slot: number;
  time: string;
}

export interface Blueprint {
  version: string;
  project: string;
  created_at: string;
  updated_at: string;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  nextSeq?: number;    // monotonic counter — only goes up, never reset
  // Undo system
  undo_pending?: boolean;
  undo_diff?: { snapshot_time: string; changes: string[] };
  last_checkpoint?: string; // written by MCP synapse_checkpoint to trigger fs.watch
}

// Extension host → Webview
export type ExtToWebMsg =
  | { type: 'init';           blueprint: Blueprint }
  | { type: 'full-refresh';   blueprint: Blueprint }
  | { type: 'node-added';     node: BlueprintNode }
  | { type: 'node-updated';   node: BlueprintNode }
  | { type: 'node-removed';   id: string }
  | { type: 'edge-added';     edge: BlueprintEdge }
  | { type: 'edge-removed';   id: string }
  | { type: 'save-status';    state: 'saving' | 'saved'; timestamp?: string }
  | { type: 'snapshot-state'; snapshots: SnapshotInfo[]; diff: string[] };

// Webview → Extension host
export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'add-node';         node: Omit<BlueprintNode, 'id' | 'created_at' | 'updated_at'> }
  | { type: 'update-node';      id: string; fields: Partial<BlueprintNode> }
  | { type: 'remove-node';      id: string }
  | { type: 'move-node';        id: string; position: { x: number; y: number } }
  | { type: 'add-edge';         source: string; target: string; label?: string }
  | { type: 'remove-edge';      id: string }
  | { type: 'export' }
  | { type: 'import' }
  | { type: 'snapshot' }
  | { type: 'restore-snapshot'; slot: number };
