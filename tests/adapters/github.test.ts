import { describe, expect, test } from 'vitest';
import { Request } from 'express';
import { githubAdapter } from '../../src/adapters/github';

const mockRequest = (event: string, body: Record<string, unknown>): Request =>
  ({
    headers: { 'x-github-event': event },
    body
  }) as unknown as Request;

describe('GitHubAdapter.parseWebhookEvent', () => {
  test('parses issues opened event when issue body mentions bot handle', () => {
    const req = mockRequest('issues', {
      action: 'opened',
      repository: { full_name: 'owner/repo' },
      issue: { number: 42, body: 'hi @gitagent please handle this', user: { login: 'alice' } }
    });

    const parsed = githubAdapter.parseWebhookEvent(req);
    expect(parsed).not.toBeNull();
    expect(parsed?.threadType).toBe('issue');
    expect(parsed?.issueNumber).toBe(42);
    expect(parsed?.body).toContain('@gitagent');
    expect(parsed?.author).toBe('alice');
  });

  test('ignores issues event without mention', () => {
    const req = mockRequest('issues', {
      action: 'opened',
      repository: { full_name: 'owner/repo' },
      issue: { number: 42, body: 'no mention here', user: { login: 'alice' } }
    });

    expect(githubAdapter.parseWebhookEvent(req)).toBeNull();
  });

  test('parses issue_comment mention on issue', () => {
    const req = mockRequest('issue_comment', {
      action: 'created',
      repository: { full_name: 'owner/repo' },
      issue: { number: 7 },
      comment: { body: 'please run @gitagent', user: { login: 'bob' } }
    });

    const parsed = githubAdapter.parseWebhookEvent(req);
    expect(parsed).not.toBeNull();
    expect(parsed?.threadType).toBe('issue');
    expect(parsed?.issueNumber).toBe(7);
    expect(parsed?.author).toBe('bob');
  });
});
