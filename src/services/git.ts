import { execSync } from 'node:child_process';

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);

export const determineBranchName = (issueTitle: string, issueNumber: number, agentSummary: string): string => {
  const normalizedTitle = issueTitle.trim();
  const prefix = /(fix|bug|resolve)/i.test(normalizedTitle) ? 'fix' : /(doc|readme)/i.test(normalizedTitle) ? 'chore' : 'feature';
  const slug = slugify(normalizedTitle || agentSummary || `session-${issueNumber}`);
  return `${prefix}/${slug || 'update'}-${issueNumber}`;
};

export const createBranch = (repoPath: string, branchName: string, baseBranch: string): void => {
  execSync(`git fetch origin ${baseBranch}`, { cwd: repoPath, stdio: 'inherit' });
  execSync(`git checkout ${baseBranch}`, { cwd: repoPath, stdio: 'inherit' });
  execSync(`git checkout -b ${branchName}`, { cwd: repoPath, stdio: 'inherit' });
};

export const stageAndCommit = (repoPath: string, message: string): void => {
  execSync('git add -A', { cwd: repoPath, stdio: 'inherit' });
  execSync(`git commit -m "${message}"`, { cwd: repoPath, stdio: 'inherit' });
};

export const pushBranch = (repoPath: string, branchName: string, remote = 'origin'): void => {
  execSync(`git push ${remote} ${branchName}`, { cwd: repoPath, stdio: 'inherit' });
};
