import fetch from 'node-fetch';
import { Request } from 'express';
import { Config } from '../config';
import { IPlatformAdapter, PRResult, ThreadType, WebhookEvent, IssueContext } from './types';

const API_BASE = 'https://gitlab.com/api/v4';

class GitLabAdapter implements IPlatformAdapter {
  verifyWebhookSignature(req: Request, secret: string): boolean {
    const token = (req.headers['x-gitlab-token'] ?? '') as string;
    const expectedSecret = Config.gitlabWebhookSecret ?? secret;
    return token !== '' && expectedSecret !== '' && token === expectedSecret;
  }

  parseWebhookEvent(req: Request): WebhookEvent | null {
    const body = req.body as Record<string, any>;
    if (body.object_kind !== 'note') {
      return null;
    }

    const mention = `@${Config.botHandle}`;
    const noteBody = (body.object_attributes?.note ?? '') as string;
    if (!noteBody.includes(mention)) {
      return null;
    }

    const project = body.project?.path_with_namespace ?? body.project?.path_with_namespace;
    if (!project) {
      return null;
    }

    const isIssue = Boolean(body.issue);
    const threadType: ThreadType = isIssue ? 'issue' : 'pr';
    const issueNumber = Number(body.issue?.iid ?? body.merge_request?.iid ?? 0);
    const prNumber = threadType === 'pr' ? Number(body.merge_request?.iid ?? 0) : undefined;

    if (!issueNumber) {
      return null;
    }

    return {
      platform: 'gitlab',
      threadType,
      repo: project,
      issueNumber,
      prNumber,
      body: noteBody,
      author: (body.user?.username ?? '') as string,
      metadata: { payload: body },
      eventId: `${body.object_kind}:${body.object_attributes?.id ?? ''}`
    };
  }

  private headers(): Record<string, string> {
    return {
      'Private-Token': Config.gitlabBotToken ?? '',
      'Content-Type': 'application/json'
    };
  }

  async postComment(repo: string, threadId: number, threadType: ThreadType, body: string): Promise<void> {
    const encoded = encodeURIComponent(repo);
    const target =
      threadType === 'issue'
        ? `${API_BASE}/projects/${encoded}/issues/${threadId}/notes`
        : `${API_BASE}/projects/${encoded}/merge_requests/${threadId}/notes`;
    await fetch(target, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ body })
    });
  }

  private async resolveProjectId(repo: string): Promise<number> {
    const encoded = encodeURIComponent(repo);
    const response = await fetch(`${API_BASE}/projects/${encoded}`, { headers: this.headers() });
    const data = (await response.json()) as { id?: number };
    if (!data.id) {
      throw new Error(`Unable to resolve GitLab project ${repo}`);
    }
    return data.id;
  }

  async createPR(repo: string, branch: string, base: string, title: string, body: string): Promise<PRResult> {
    const projectId = await this.resolveProjectId(repo);
    const response = await fetch(`${API_BASE}/projects/${projectId}/merge_requests`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        title,
        source_branch: branch,
        target_branch: base,
        description: body
      })
    });
    const data = (await response.json()) as Record<string, unknown>;
    return {
      url: (data.web_url ?? '') as string,
      number: Number(data.iid ?? 0),
      id: (data.id ?? '') as string
    };
  }

  async requestReview(_repo: string, _prNumber: number, _username: string): Promise<void> {
    void _repo;
    void _prNumber;
    void _username;
    return Promise.resolve();
  }

  async linkIssueToPR(repo: string, issueNumber: number, prNumber: number): Promise<void> {
    const projectId = await this.resolveProjectId(repo);
    await fetch(`${API_BASE}/projects/${projectId}/merge_requests/${prNumber}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({
        description: `Closes #${issueNumber}`
      })
    });
  }

  async getIssueContext(repo: string, issueNumber: number): Promise<IssueContext> {
    const projectId = await this.resolveProjectId(repo);
    const issueResponse = await fetch(`${API_BASE}/projects/${projectId}/issues/${issueNumber}`, {
      headers: this.headers()
    });
    const issueData = (await issueResponse.json()) as Record<string, unknown>;
    const notesResponse = await fetch(
      `${API_BASE}/projects/${projectId}/issues/${issueNumber}/notes`,
      { headers: this.headers() }
    );
    const notes = (await notesResponse.json()) as Array<{
      author?: { username?: string };
      body?: string;
      created_at?: string;
    }>;

    return {
      title: (issueData.title ?? '') as string,
      body: (issueData.description ?? '') as string,
      labels: ((issueData.labels ?? []) as string[]).filter(Boolean),
      comments: notes.map((note) => ({
        author: (note.author?.username ?? '') as string,
        body: (note.body ?? '') as string,
        createdAt: (note.created_at ?? '') as string
      }))
    };
  }
}

export const gitlabAdapter = new GitLabAdapter();
export default GitLabAdapter;
