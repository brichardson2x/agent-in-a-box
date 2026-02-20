import { Request } from 'express';
import { Platform } from '../types';

export type ThreadType = 'issue' | 'pr';

export interface WebhookEvent {
  platform: Platform;
  threadType: ThreadType;
  repo: string;
  issueNumber: number;
  prNumber?: number | null;
  body: string;
  author: string;
  metadata: Record<string, unknown>;
  eventId?: string;
}

export interface PRResult {
  url: string;
  number: number;
  id: string;
}

export interface IssueContext {
  title: string;
  body: string;
  labels: string[];
  comments: Array<{ author: string; body: string; createdAt: string }>;
}

export interface IPlatformAdapter {
  verifyWebhookSignature(req: Request, secret: string, rawBody: Buffer): boolean;
  parseWebhookEvent(req: Request): WebhookEvent | null;
  postComment(repo: string, threadId: number, threadType: ThreadType, body: string): Promise<void>;
  createPR(repo: string, branch: string, base: string, title: string, body: string): Promise<PRResult>;
  requestReview(repo: string, prNumber: number, username: string): Promise<void>;
  linkIssueToPR(repo: string, issueNumber: number, prNumber: number): Promise<void>;
  getIssueContext(repo: string, issueNumber: number): Promise<IssueContext>;
}
