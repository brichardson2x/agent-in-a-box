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

const readGit = (repoPath: string, args: string[]): string =>
  execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim();

const remoteHasBranch = (repoPath: string, branch: string): boolean => {
  try {
    execFileSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], {
      cwd: repoPath,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
};

const remoteDefaultBranch = (repoPath: string): string | undefined => {
  try {
    const output = readGit(repoPath, ['ls-remote', '--symref', 'origin', 'HEAD']);
    const match = output.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
    return match?.[1];
  } catch {
    return undefined;
  }
};

export const resolveBaseBranch = (repoPath: string, configuredBaseBranch: string): string => {
  const normalizedBaseBranch = configuredBaseBranch.trim();
  if (normalizedBaseBranch && remoteHasBranch(repoPath, normalizedBaseBranch)) {
    return normalizedBaseBranch;
  }

  const detectedBaseBranch = remoteDefaultBranch(repoPath);
  if (detectedBaseBranch) {
    return detectedBaseBranch;
  }

  throw new Error(
    `Unable to resolve remote base branch (configured DEFAULT_BRANCH=${configuredBaseBranch}). Set DEFAULT_BRANCH to an existing branch on origin.`
  );
};

export const createBranch = (repoPath: string, branchName: string, baseBranch: string): void => {
  const resolvedBaseBranch = resolveBaseBranch(repoPath, baseBranch);
  runGit(repoPath, ['fetch', 'origin', resolvedBaseBranch]);
  try {
    runGit(repoPath, ['checkout', resolvedBaseBranch]);
  } catch {
    runGit(repoPath, ['checkout', '-b', resolvedBaseBranch, `origin/${resolvedBaseBranch}`]);
  }
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
