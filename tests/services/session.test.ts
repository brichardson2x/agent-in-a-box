import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebhookEvent } from '../../src/adapters/types';
import { overrideDatabase } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrations';
import { getSessionByPrId } from '../../src/db/sessions';
import { resolveSession } from '../../src/services/session';

const baseEvent: WebhookEvent = {
  platform: 'github',
  threadType: 'issue',
  repo: 'owner/repo',
  issueNumber: 42,
  body: '@gitagent please fix',
  author: 'alice',
  metadata: {}
};

describe('resolveSession', () => {
  beforeEach(() => {
    overrideDatabase(new Database(':memory:'));
    runMigrations();
  });

  afterEach(() => {
    overrideDatabase(new Database(':memory:'));
  });

  it('reuses the issue session when a PR event arrives', async () => {
    const issueSession = await resolveSession(baseEvent);
    const prSession = await resolveSession({
      ...baseEvent,
      threadType: 'pr',
      prNumber: 101
    });

    expect(prSession.id).toBe(issueSession.id);
    expect(getSessionByPrId('github-owner/repo-pr-101')?.id).toBe(issueSession.id);
  });

  it('creates an issue-keyed session when first seen from a PR event', async () => {
    const session = await resolveSession({
      ...baseEvent,
      issueNumber: 77,
      threadType: 'pr',
      prNumber: 77
    });

    expect(session.issueId).toBe('github-owner/repo-issue-77');
    expect(getSessionByPrId('github-owner/repo-pr-77')?.id).toBe(session.id);
  });
});
