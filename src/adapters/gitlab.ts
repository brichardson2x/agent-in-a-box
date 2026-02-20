import fetch, { Response } from 'node-fetch';
import { Request } from 'express';
import { Config } from '../config';
import { IPlatformAdapter, PRResult, ThreadType, WebhookEvent, IssueContext } from './types';

const API_BASE = 'https://gitlab.com/api/v4';

class GitLabAdapter implements IPlatformAdapter {
  private async ensureOk(response: Response, context: string): Promise<void> {
    if (response.ok) {
      return;
    }
    const details = await response.text();
    throw new Error(`${context} failed (${response.status}): ${details}`);
  }

  verifyWebhookSignature(req: Request, secret: string, _rawBody: Buffer): boolean {
    void _rawBody;
    const token = (req.headers['x-gitlab-token'] ?? '') as string;
    return token !== '' && secret !== '' && token === secret;
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

    const project = body.project?.path_with_namespace;
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
      'Private-Token': Config.platformToken,
      'Content-Type': 'application/json'
    };
  }

  async postComment(repo: string, threadId: number, threadType: ThreadType, body: string): Promise<void> {
    const encoded = encodeURIComponent(repo);
    const target =
      threadType === 'issue'
        ? `${API_BASE}/projects/${encoded}/issues/${threadId}/notes`
        : `${API_BASE}/projects/${encoded}/merge_requests/${threadId}/notes`;
    const response = await fetch(target, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ body })
    });
    await this.ensureOk(response, 'GitLab post comment');
  }

  private async resolveProjectId(repo: string): Promise<number> {
    const encoded = encodeURIComponent(repo);
    const response = await fetch(`${API_BASE}/projects/${encoded}`, { headers: this.headers() });
    await this.ensureOk(response, 'GitLab resolve project');
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
    await this.ensureOk(response, 'GitLab create merge request');
    const data = (await response.json()) as Record<string, unknown>;
    return {
      url: (data.web_url ?? '') as string,
      number: Number(data.iid ?? 0),
      id: (data.id ?? '') as string
    };
  }

  async requestReview(repo: string, prNumber: number, username: string): Promise<void> {
    const projectId = await this.resolveProjectId(repo);
    const usersResponse = await fetch(`${API_BASE}/users?username=${encodeURIComponent(username)}`, {
      headers: this.headers()
    });
    await this.ensureOk(usersResponse, 'GitLab find reviewer');
    const users = (await usersResponse.json()) as Array<{ id?: number; username?: string }>;
    const reviewer = users.find((candidate) => candidate.username === username);
    if (!reviewer?.id) {
      throw new Error(`GitLab reviewer ${username} was not found`);
    }

    const response = await fetch(`${API_BASE}/projects/${projectId}/merge_requests/${prNumber}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ reviewer_ids: [reviewer.id] })
    });
    await this.ensureOk(response, 'GitLab request review');
  }

  async linkIssueToPR(repo: string, issueNumber: number, prNumber: number): Promise<void> {
    const projectId = await this.resolveProjectId(repo);
    const currentMrResponse = await fetch(`${API_BASE}/projects/${projectId}/merge_requests/${prNumber}`, {
      headers: this.headers()
    });
    await this.ensureOk(currentMrResponse, 'GitLab fetch merge request for issue link');
    const currentMr = (await currentMrResponse.json()) as { description?: string };
    const closeLine = `Closes #${issueNumber}`;
    const updatedDescription =
      typeof currentMr.description === 'string' && currentMr.description.includes(closeLine)
        ? currentMr.description
        : [currentMr.description ?? '', closeLine].filter(Boolean).join('\n\n');

    const response = await fetch(`${API_BASE}/projects/${projectId}/merge_requests/${prNumber}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({
        description: updatedDescription
      })
    });
    await this.ensureOk(response, 'GitLab link issue to merge request');
  }

  async getIssueContext(repo: string, issueNumber: number): Promise<IssueContext> {
    const projectId = await this.resolveProjectId(repo);
    const issueResponse = await fetch(`${API_BASE}/projects/${projectId}/issues/${issueNumber}`, {
      headers: this.headers()
    });
    await this.ensureOk(issueResponse, 'GitLab get issue context');
    const issueData = (await issueResponse.json()) as Record<string, unknown>;
    const notesResponse = await fetch(
      `${API_BASE}/projects/${projectId}/issues/${issueNumber}/notes`,
      { headers: this.headers() }
    );
    await this.ensureOk(notesResponse, 'GitLab get issue notes');
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
