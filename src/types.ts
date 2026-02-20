export type Platform = 'github' | 'gitlab';

export type HistoryRole = 'system' | 'user' | 'assistant';

export interface HistoryTurn {
  timestamp: number;
  role: HistoryRole;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  issueId: string;
  prId?: string | null;
  platform: Platform;
  repo: string;
  branch?: string | null;
  history: HistoryTurn[];
  createdAt: number;
  updatedAt: number;
}
