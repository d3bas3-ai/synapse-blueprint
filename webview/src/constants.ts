import { NodeType, NodeStatus, NodePriority } from '../../src/types';

export const TYPE_COLORS: Record<NodeType, string> = {
  feature:    '#22c55e',
  component:  '#3b82f6',
  decision:   '#a855f7',
  dependency: '#f59e0b',
  research:   '#06b6d4',
  todo:       '#6b7280',
  done:       '#16a34a',
  problem:    '#ef4444',
  note:       '#d97706',
};

export const PRIORITY_COLORS: Record<NodePriority, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#22c55e',
};

export const STATUS_COLORS: Record<NodeStatus, string> = {
  'planned':     '#6b7280',
  'in-progress': '#f59e0b',
  'done':        '#22c55e',
  'blocked':     '#ef4444',
};
