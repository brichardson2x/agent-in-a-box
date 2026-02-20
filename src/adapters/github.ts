import { createHmac, timingSafeEqual } from 'node:crypto';
import fetch from 'node-fetch';
import { Request } from 'express';
import { Config } from '../config';
import { IPlatformAdapter, PRResult, ThreadType, WebhookEvent, IssueContext } from './types';

const API_BASE = 'https://api.github.com';

class GitHubAdapter implements IPlatformAdapter {
  verifyWebhookSignature(req: Request, secret: string, rawBody: Buffer): boolean {
    const signature = (req.headers['x-hub-signature-256'] ?? '') as string;
    if (!signature.startsWith('sha256=')) {
      return false;
    }
    const computed = createHmac('sha256', secret).update(rawBody).digest('hex');
    const digest = Buffer.from(computed, 'hex');
    const headerDigest = Buffer.from(signature.replace('sha256=', ''), 'hex');
    if (digest.length !== headerDigest.length) {
      return false;
    }
    return timingSafeEqual(digest, headerDigest);
  }

  parseWebhookEvent(req: Request): WebhookEvent | null {
    const body = req.body as any;
    const event = (req.headers['x-github-event'] ?? '') as string;
    const githubRepo = body.repository?.full_name ?? body.repository?.name;
    if (!githubRepo) {
      return null;
    }

    const mention = `@${Config.botHandle}`;
    const commentBody = (body.comment?.body ?? body.review?.body ?? '') as string;
    if (!commentBody.includes(mention)) {
      return null;
    }

    const threadType: ThreadType = event === 'pull_request_review_comment' ? 'pr' : 'issue';
    const issueNumber = Number(body.issue?.number ?? body.pull_request?.number ?? 0);
    const prNumber = threadType === 'pr' ? Number(body.pull_request?.number ?? body.comment?.pull_request_url?.split('/').pop()) : undefined;
    const author = (body.comment?.user?.login ?? body.review?.user?.login ?? '') as string;

    if (!issueNumber) {
      return null;
    }

    return {
      platform: 'github',
      threadType,
      repo: githubRepo,
      issueNumber,
      prNumber: prNumber || undefined,
      body: commentBody,
      author,
      metadata: { event, payload: body },
      eventId: body.action ? `${event}:${body.action}` : event
    };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${Config.platformToken}`,
      Accept: 'application/vnd.github+json'
    };
  }

  async postComment(repo: string, threadId: number, threadType: ThreadType, body: string): Promise<void> {
    const threadPath = threadType === 'issue' ? 'issues' : 'issues';
    await fetch(`${API_BASE}/repos/${repo}/${threadPath}/${threadId}/comments`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
  }

  async createPR(repo: string, branch: string, base: string, title: string, body: string): Promise<PRResult> {
    const result = await fetch(`${API_BASE}/repos/${repo}/pulls`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        head: branch,
        base,
        body
      })
    });
    const data = (await result.json()) as Record<string, unknown>;
    return {
      url: (data.html_url ?? '') as string,
      number: Number(data.number ?? 0),
      id: (data.node_id ?? '') as string
    };
  }

  async requestReview(repo: string, prNumber: number, username: string): Promise<void> {
    await fetch(`${API_BASE}/repos/${repo}/pulls/${prNumber}/requested_reviewers`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewers: [username] })
    });
  }

  async linkIssueToPR(repo: string, issueNumber: number, prNumber: number): Promise<void> {
    await fetch(`${API_BASE}/repos/${repo}/pulls/${prNumber}`, {
      method: 'PATCH',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: `Closes #${issueNumber}` })
    });
  }

  async getIssueContext(repo: string, issueNumber: number): Promise<IssueContext> {
    const issueResponse = await fetch(`${API_BASE}/repos/${repo}/issues/${issueNumber}`, {
      headers: this.headers()
    });
    const issueData = (await issueResponse.json()) as Record<string, unknown>;
    const commentsResponse = await fetch(`${API_BASE}/repos/${repo}/issues/${issueNumber}/comments`, {
      headers: this.headers()
    });
    const comments = (await commentsResponse.json()) as Array<{
      user?: { login?: string };
      body?: string;
      created_at?: string;
    }>;

    return {
      title: (issueData.title ?? '') as string,
      body: (issueData.body ?? '') as string,
      labels: ((issueData.labels ?? []) as Array<{ name?: string }>).map((label) => label.name ?? '').filter(Boolean),
      comments: comments.map((comment) => ({
        author: (comment.user?.login ?? '') as string,
        body: (comment.body ?? '') as string,
        createdAt: (comment.created_at ?? '') as string
      }))
    };
  }
}

export const githubAdapter = new GitHubAdapter();
export default GitHubAdapter;
