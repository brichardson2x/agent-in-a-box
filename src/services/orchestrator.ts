import { Config } from '../config';
import { getAdapter } from '../adapters/factory';
import { WebhookEvent } from '../adapters/types';
import { getAgent } from '../agents/factory';
import { acknowledgmentComment, agentFailedComment, prCreatedComment, prDescription, pushFailedComment } from '../utils/responses';
import { buildPrompt, recordHistory, resolveSession } from './session';
import { determineBranchName, createBranch, stageAndCommit, pushBranch } from './git';
import { updateSessionBranch } from '../db/sessions';

const createIssueUrl = (platform: string, repo: string, number: number): string => {
  if (platform === 'github') {
    return `https://github.com/${repo}/issues/${number}`;
  }
  return `https://gitlab.com/${repo}/-/issues/${number}`;
};

export const orchestrateJob = async (event: WebhookEvent, adapter = getAdapter()): Promise<void> => {
  const threadId = event.threadType === 'issue' ? event.issueNumber : event.prNumber ?? event.issueNumber;
  await adapter.postComment(event.repo, threadId, event.threadType, acknowledgmentComment());

  const session = await resolveSession(event);
  const issueContext = await adapter.getIssueContext(event.repo, event.issueNumber);
  const branchName = determineBranchName(issueContext.title, event.issueNumber, event.body);
  createBranch(Config.repoPath, branchName, Config.defaultBranch);
  updateSessionBranch(session.id, branchName);
  const prompt = buildPrompt(session, event, issueContext);

  const agent = getAgent();
  const agentResult = await agent.run(prompt, Config.repoPath, session.id);
  recordHistory(session.id, {
    timestamp: Date.now(),
    role: 'assistant',
    content: agentResult.summary,
    metadata: { success: agentResult.success }
  });

  if (!agentResult.success) {
    await adapter.postComment(event.repo, threadId, event.threadType, agentFailedComment(agentResult.error ?? 'Agent execution failed'));
    return;
  }

  try {
    stageAndCommit(Config.repoPath, `feat: ${agentResult.summary}`);
  } catch (error) {
    await adapter.postComment(event.repo, threadId, event.threadType, pushFailedComment((error as Error).message));
    return;
  }

  try {
    pushBranch(Config.repoPath, branchName, 'origin');
  } catch (error) {
    await adapter.postComment(event.repo, threadId, event.threadType, pushFailedComment((error as Error).message));
    return;
  }

  const issueUrl = createIssueUrl(event.platform, event.repo, event.issueNumber);
  const prDescriptionBody = prDescription(agentResult.summary, issueUrl, session.id);
  const pr = await adapter.createPR(event.repo, branchName, Config.defaultBranch, issueContext.title, prDescriptionBody);

  await adapter.requestReview(event.repo, pr.number, Config.reviewer);
  await adapter.linkIssueToPR(event.repo, event.issueNumber, pr.number);
  await adapter.postComment(event.repo, threadId, event.threadType, prCreatedComment(pr.url));

  recordHistory(session.id, {
    timestamp: Date.now(),
    role: 'assistant',
    content: `Opened PR ${pr.url}`,
    metadata: { pr: pr.url }
  });
};
