import { execFileSync } from 'node:child_process';

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);

export const determineBranchName = (issueTitle: string, issueNumber: number, agentSummary: string): string => {
  const normalizedTitle = issueTitle.trim();
  const prefix = /(fix|bug|resolve)/i.test(normalizedTitle) ? 'fix' : /(doc|readme)/i.test(normalizedTitle) ? 'misc' : 'feature';
  const slug = slugify(normalizedTitle || agentSummary || `session-${issueNumber}`);
  return `${prefix}/${slug || 'update'}-${issueNumber}`;
};

const runGit = (repoPath: string, args: string[]): void => {
  execFileSync('git', args, { cwd: repoPath, stdio: 'inherit' });
};

export const createBranch = (repoPath: string, branchName: string, baseBranch: string): void => {
  runGit(repoPath, ['fetch', 'origin', baseBranch]);
  runGit(repoPath, ['checkout', baseBranch]);
  runGit(repoPath, ['checkout', '-b', branchName]);
};

export const checkoutBranch = (repoPath: string, branchName: string): void => {
  runGit(repoPath, ['fetch', 'origin', branchName]);
  try {
    runGit(repoPath, ['checkout', branchName]);
  } catch {
    runGit(repoPath, ['checkout', '-b', branchName, `origin/${branchName}`]);
  }
};

export const stageAndCommit = (repoPath: string, message: string): void => {
  runGit(repoPath, ['add', '-A']);
  runGit(repoPath, ['commit', '-m', message]);
};

export const pushBranch = (repoPath: string, branchName: string, remote = 'origin'): void => {
  runGit(repoPath, ['push', remote, branchName]);
};
