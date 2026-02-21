import { createHmac, timingSafeEqual } from 'node:crypto';
import fetch, { Response } from 'node-fetch';
import { Request } from 'express';
import { Config } from '../config';
import { IPlatformAdapter, PRResult, ThreadType, WebhookEvent, IssueContext } from './types';
import { getInstallationToken } from './github-auth';

const API_BASE = 'https://api.github.com';

class GitHubAdapter implements IPlatformAdapter {
  private mentions(): string[] {
    const handles = [Config.botHandle, Config.agent, `${Config.agent}-box`]
      .map((value) => value.trim().replace(/^@+/, '').toLowerCase())
      .filter(Boolean);
    return [...new Set(handles)].map((handle) => `@${handle}`);
  }

  private containsMention(text: string, mentions: string[]): boolean {
    const lower = text.toLowerCase();
    return mentions.some((mention) => lower.includes(mention));
  }

  private async ensureOk(response: Response, context: string): Promise<void> {
    if (response.ok) {
      return;
    }
    const details = await response.text();
    throw new Error(`${context} failed (${response.status}): ${details}`);
  }

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

    const action = (body.action ?? '') as string;
    const isIssueEvent = event === 'issues';
    const isIssueCommentEvent = event === 'issue_comment';
    const isReviewCommentEvent = event === 'pull_request_review_comment';
    if (!isIssueEvent && !isIssueCommentEvent && !isReviewCommentEvent) {
      return null;
    }

    if (isIssueEvent && !['opened', 'edited', 'reopened'].includes(action)) {
      return null;
    }

    const eventBodyRaw =
      isIssueEvent ? `${body.issue?.title ?? ''}\n${body.issue?.body ?? ''}` : body.comment?.body ?? body.review?.body ?? '';
    const eventBody = typeof eventBodyRaw === 'string' ? eventBodyRaw : '';
    if (!this.containsMention(eventBody, this.mentions())) {
      return null;
    }

    const isIssueCommentOnPr = isIssueCommentEvent && Boolean(body.issue?.pull_request);
    const threadType: ThreadType = event === 'pull_request_review_comment' || isIssueCommentOnPr ? 'pr' : 'issue';
    const issueNumber = Number(body.issue?.number ?? body.pull_request?.number ?? 0);
    const prNumber =
      threadType === 'pr'
        ? Number(body.pull_request?.number ?? body.issue?.number ?? body.comment?.pull_request_url?.split('/').pop())
        : undefined;
    const author = (isIssueEvent ? body.issue?.user?.login : body.comment?.user?.login ?? body.review?.user?.login ?? '') as string;

    if (!issueNumber) {
      return null;
    }

    return {
      platform: 'github',
      threadType,
      repo: githubRepo,
      issueNumber,
      prNumber: prNumber || undefined,
      body: eventBody,
      author,
      metadata: { event, payload: body },
      eventId: body.action ? `${event}:${body.action}` : event
    };
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await getInstallationToken();
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    };
  }

  async postComment(repo: string, threadId: number, threadType: ThreadType, body: string): Promise<void> {
    const threadPath = threadType === 'issue' ? 'issues' : 'issues';
    const headers = await this.headers();
    const response = await fetch(`${API_BASE}/repos/${repo}/${threadPath}/${threadId}/comments`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    await this.ensureOk(response, 'GitHub post comment');
  }

  async createPR(repo: string, branch: string, base: string, title: string, body: string): Promise<PRResult> {
    const headers = await this.headers();
    const result = await fetch(`${API_BASE}/repos/${repo}/pulls`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        head: branch,
        base,
        body
      })
    });
    await this.ensureOk(result, 'GitHub create PR');
    const data = (await result.json()) as Record<string, unknown>;
    return {
      url: (data.html_url ?? '') as string,
      number: Number(data.number ?? 0),
      id: (data.node_id ?? '') as string
    };
  }

  async requestReview(repo: string, prNumber: number, username: string): Promise<void> {
    const headers = await this.headers();
    const response = await fetch(`${API_BASE}/repos/${repo}/pulls/${prNumber}/requested_reviewers`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewers: [username] })
    });
    await this.ensureOk(response, 'GitHub request review');
  }

  async linkIssueToPR(repo: string, issueNumber: number, prNumber: number): Promise<void> {
    const headers = await this.headers();
    const currentPrResponse = await fetch(`${API_BASE}/repos/${repo}/pulls/${prNumber}`, {
      headers
    });
    await this.ensureOk(currentPrResponse, 'GitHub fetch PR for issue link');
    const currentPr = (await currentPrResponse.json()) as { body?: string };
    const closeLine = `Closes #${issueNumber}`;
    const updatedBody =
      typeof currentPr.body === 'string' && currentPr.body.includes(closeLine)
        ? currentPr.body
        : [currentPr.body ?? '', closeLine].filter(Boolean).join('\n\n');

    const response = await fetch(`${API_BASE}/repos/${repo}/pulls/${prNumber}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: updatedBody })
    });
    await this.ensureOk(response, 'GitHub link issue to PR');
  }

  async getIssueContext(repo: string, issueNumber: number): Promise<IssueContext> {
    const headers = await this.headers();
    const issueResponse = await fetch(`${API_BASE}/repos/${repo}/issues/${issueNumber}`, {
      headers
    });
    await this.ensureOk(issueResponse, 'GitHub get issue context');
    const issueData = (await issueResponse.json()) as Record<string, unknown>;
    const commentsResponse = await fetch(`${API_BASE}/repos/${repo}/issues/${issueNumber}/comments`, {
      headers
    });
    await this.ensureOk(commentsResponse, 'GitHub get issue comments');
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
