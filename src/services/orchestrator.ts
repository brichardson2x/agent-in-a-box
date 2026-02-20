import { Config } from '../config';
import { getAdapter } from '../adapters/factory';
import { WebhookEvent } from '../adapters/types';
import { getAgent } from '../agents/factory';
import { acknowledgmentComment, agentFailedComment, prCreatedComment, prDescription, pushFailedComment } from '../utils/responses';
import { buildPrompt, recordHistory, resolveSession } from './session';
import { checkoutBranch, createBranch, determineBranchName, pushBranch, stageAndCommit } from './git';
import { linkPrToSession, updateSessionBranch } from '../db/sessions';

const createIssueUrl = (platform: string, repo: string, number: number): string => {
  if (platform === 'github') {
    return `https://github.com/${repo}/issues/${number}`;
  }
  return `https://gitlab.com/${repo}/-/issues/${number}`;
};

const createPrUrl = (platform: string, repo: string, number: number): string => {
  if (platform === 'github') {
    return `https://github.com/${repo}/pull/${number}`;
  }
  return `https://gitlab.com/${repo}/-/merge_requests/${number}`;
};

const parsePrNumber = (prId?: string | null): number | null => {
  if (!prId) {
    return null;
  }
  const match = prId.match(/-pr-(\d+)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
};

const prSessionKey = (platform: string, repo: string, prNumber: number): string =>
  `${platform}-${repo}-pr-${prNumber}`;

export const orchestrateJob = async (event: WebhookEvent, adapter = getAdapter()): Promise<void> => {
  const threadId = event.threadType === 'issue' ? event.issueNumber : event.prNumber ?? event.issueNumber;
  await adapter.postComment(event.repo, threadId, event.threadType, acknowledgmentComment());

  const session = await resolveSession(event);
  const issueContext = await adapter.getIssueContext(event.repo, event.issueNumber);
  const branchName = session.branch ?? determineBranchName(issueContext.title, event.issueNumber, event.body);
  if (session.branch) {
    checkoutBranch(Config.repoPath, session.branch);
  } else {
    createBranch(Config.repoPath, branchName, Config.defaultBranch);
    updateSessionBranch(session.id, branchName);
  }
  recordHistory(session.id, {
    timestamp: Date.now(),
    role: 'user',
    content: event.body,
    metadata: { author: event.author, threadType: event.threadType }
  });
  const prompt = buildPrompt(session, event, issueContext);

  const agent = getAgent();
  const agentResult = await agent.run(prompt, Config.repoPath, session.id);

  if (!agentResult.success) {
    recordHistory(session.id, {
      timestamp: Date.now(),
      role: 'assistant',
      content: `Agent failed: ${agentResult.error ?? 'Agent execution failed'}`,
      metadata: { success: false }
    });
    await adapter.postComment(event.repo, threadId, event.threadType, agentFailedComment(agentResult.error ?? 'Agent execution failed'));
    return;
  }

  try {
    stageAndCommit(Config.repoPath, `feat: ${agentResult.summary}`);
  } catch (error) {
    recordHistory(session.id, {
      timestamp: Date.now(),
      role: 'assistant',
      content: `Commit failed: ${(error as Error).message}`,
      metadata: { success: false }
    });
    await adapter.postComment(event.repo, threadId, event.threadType, pushFailedComment((error as Error).message));
    return;
  }

  try {
    pushBranch(Config.repoPath, branchName, 'origin');
  } catch (error) {
    recordHistory(session.id, {
      timestamp: Date.now(),
      role: 'assistant',
      content: `Push failed: ${(error as Error).message}`,
      metadata: { success: false }
    });
    await adapter.postComment(event.repo, threadId, event.threadType, pushFailedComment((error as Error).message));
    return;
  }

  const existingPrNumber = event.prNumber ?? parsePrNumber(session.prId);
  if (existingPrNumber) {
    const existingPrUrl = createPrUrl(event.platform, event.repo, existingPrNumber);
    await adapter.postComment(event.repo, existingPrNumber, 'pr', prCreatedComment(existingPrUrl));
    recordHistory(session.id, {
      timestamp: Date.now(),
      role: 'assistant',
      content: `Updated PR ${existingPrUrl}`,
      metadata: { pr: existingPrUrl }
    });
    return;
  }
  recordHistory(session.id, {
    timestamp: Date.now(),
    role: 'assistant',
    content: agentResult.summary,
    metadata: { success: true }
  });

  const issueUrl = createIssueUrl(event.platform, event.repo, event.issueNumber);
  const prDescriptionBody = prDescription(agentResult.summary, issueUrl, session.id);
  const pr = await adapter.createPR(event.repo, branchName, Config.defaultBranch, issueContext.title, prDescriptionBody);

  await adapter.requestReview(event.repo, pr.number, Config.reviewer);
  await adapter.linkIssueToPR(event.repo, event.issueNumber, pr.number);
  linkPrToSession(session.id, prSessionKey(event.platform, event.repo, pr.number), branchName);
  await adapter.postComment(event.repo, threadId, event.threadType, prCreatedComment(pr.url));

  recordHistory(session.id, {
    timestamp: Date.now(),
    role: 'assistant',
    content: `Opened PR ${pr.url}`,
    metadata: { pr: pr.url }
  });
};
