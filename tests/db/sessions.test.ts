import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { overrideDatabase } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrations';
import { createSession, getSessionByIssueId, appendHistory, linkPrToSession, getSessionByPrId, getHistory } from '../../src/db/sessions';
import { HistoryTurn } from '../../src/types';

describe('sessions persistence', () => {
  beforeEach(() => {
    const db = new Database(':memory:');
    overrideDatabase(db);
    runMigrations();
  });

  afterEach(() => {
    overrideDatabase(new Database(':memory:'));
  });

  it('creates and retrieves a session', () => {
    const session = createSession('github-owner/repo-1', 'github', 'owner/repo');
    expect(session.issueId).toBe('github-owner/repo-1');
    const fetched = getSessionByIssueId('github-owner/repo-1');
    expect(fetched).not.toBeNull();
    expect(fetched?.repo).toBe('owner/repo');
  });

  it('appends history entries', () => {
    const session = createSession('github-owner/repo-2', 'github', 'owner/repo');
    const turn: HistoryTurn = {
      timestamp: Date.now(),
      role: 'user',
      content: 'Do something'
    };
    appendHistory(session.id, turn);
    const history = getHistory(session.id);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Do something');
  });

  it('links a PR to a session', () => {
    const session = createSession('github-owner/repo-3', 'github', 'owner/repo');
    linkPrToSession(session.id, 'github-owner/repo-pr-10');
    const linked = getSessionByPrId('github-owner/repo-pr-10');
    expect(linked).not.toBeNull();
    expect(linked?.repo).toBe('owner/repo');
  });
});
