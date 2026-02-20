import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './client';
import { HistoryTurn, Session } from '../types';

const serializeHistory = (history: HistoryTurn[]): string => JSON.stringify(history);
const deserializeHistory = (value?: string | null): HistoryTurn[] => {
  if (!value) {
    return [];
  }
  try {
    return JSON.parse(value) as HistoryTurn[];
  } catch {
    return [];
  }
};

const mapRowToSession = (row: any): Session => ({
  id: row.id,
  issueId: row.issue_id,
  prId: row.pr_id,
  platform: row.platform,
  repo: row.repo,
  branch: row.branch,
  history: deserializeHistory(row.history),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const createSession = (issueId: string, platform: Session['platform'], repo: string): Session => {
  const db = getDatabase();
  const now = Date.now();
  const session: Session = {
    id: uuidv4(),
    issueId,
    platform,
    repo,
    history: [],
    createdAt: now,
    updatedAt: now
  };

  db.prepare(
    `
      INSERT INTO sessions (id, issue_id, platform, repo, history, created_at, updated_at)
      VALUES (@id, @issueId, @platform, @repo, @history, @createdAt, @updatedAt);
    `
  ).run({
    id: session.id,
    issueId: session.issueId,
    platform: session.platform,
    repo: session.repo,
    history: serializeHistory(session.history),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  });

  return session;
};

export const getSessionByIssueId = (issueId: string): Session | null => {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM sessions WHERE issue_id = ? LIMIT 1;').get(issueId);
  if (!row) {
    return null;
  }
  return mapRowToSession(row);
};

export const getSessionByPrId = (prId: string): Session | null => {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM sessions WHERE pr_id = ? LIMIT 1;').get(prId);
  if (!row) {
    return null;
  }
  return mapRowToSession(row);
};

export const linkPrToSession = (sessionId: string, prId: string, branch?: string): void => {
  const db = getDatabase();
  db.prepare(
    `
      UPDATE sessions
      SET pr_id = @prId, branch = COALESCE(@branch, branch), updated_at = @updatedAt
      WHERE id = @id;
    `
  ).run({
    id: sessionId,
    prId,
    branch,
    updatedAt: Date.now()
  });
};

export const updateSessionBranch = (sessionId: string, branch: string): void => {
  const db = getDatabase();
  db.prepare(
    `
      UPDATE sessions
      SET branch = @branch, updated_at = @updatedAt
      WHERE id = @id;
    `
  ).run({
    id: sessionId,
    branch,
    updatedAt: Date.now()
  });
};

export const appendHistory = (sessionId: string, turn: HistoryTurn): void => {
  const db = getDatabase();
  const session = db.prepare('SELECT history FROM sessions WHERE id = ? LIMIT 1;').get(sessionId) as { history: string };
  if (!session) {
    throw new Error(`Session ${sessionId} not found while appending history`);
  }
  const history: HistoryTurn[] = [...deserializeHistory(session.history), turn];
  db.prepare(
    `
      UPDATE sessions
      SET history = @history, updated_at = @updatedAt
      WHERE id = @id;
    `
  ).run({
    id: sessionId,
    history: serializeHistory(history),
    updatedAt: Date.now()
  });
};

export const getHistory = (sessionId: string): HistoryTurn[] => {
  const db = getDatabase();
  const row = db.prepare('SELECT history FROM sessions WHERE id = ? LIMIT 1;').get(sessionId) as { history?: string } | undefined;
  if (!row) {
    return [];
  }
  return deserializeHistory(row.history);
};
