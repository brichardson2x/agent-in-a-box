import { Config } from '../config';
import { createSession, getSessionByIssueId, getSessionByPrId, linkPrToSession, appendHistory } from '../db/sessions';
import { HistoryTurn, Session } from '../types';
import { WebhookEvent } from '../adapters/types';

const sessionKey = (platform: string, repo: string, type: 'issue' | 'pr', number: number) =>
  `${platform}-${repo}-${type}-${number}`;

export const resolveSession = async (event: WebhookEvent): Promise<Session> => {
  const issueKey = sessionKey(event.platform, event.repo, 'issue', event.issueNumber);
  if (event.threadType === 'issue') {
    const existing = getSessionByIssueId(issueKey);
    if (existing) {
      return existing;
    }
    return createSession(issueKey, event.platform, event.repo);
  }

  if (event.prNumber) {
    const prKey = sessionKey(event.platform, event.repo, 'pr', event.prNumber);
    const existingPr = getSessionByPrId(prKey);
    if (existingPr) {
      return existingPr;
    }

    const issueSession = getSessionByIssueId(issueKey);
    if (issueSession) {
      linkPrToSession(issueSession.id, prKey);
      return issueSession;
    }

    return createSession(prKey, event.platform, event.repo);
  }

  const fallback = getSessionByIssueId(issueKey);
  if (fallback) {
    return fallback;
  }
  return createSession(issueKey, event.platform, event.repo);
};

export const buildPrompt = (session: Session, event: WebhookEvent, issueContext: { title: string; body: string; labels: string[] }): string => {
  const historyText = session.history
    .map((turn) => `[${turn.role.toUpperCase()} ${new Date(turn.timestamp).toISOString()}] ${turn.content}`)
    .join('\n');

  return `
${Config.systemPrompt}

Context: Repository ${event.repo}, Issue #${event.issueNumber}
Title: ${issueContext.title}
Description: ${issueContext.body}
Labels: ${issueContext.labels.join(', ')}

History:
${historyText}

Current request:
${event.body}
`.trim();
};

export const recordHistory = (sessionId: string, turn: HistoryTurn): void => {
  appendHistory(sessionId, turn);
};
