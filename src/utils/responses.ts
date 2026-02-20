export const acknowledgmentComment = (): string => "I'm on it and will report back with a PR soon.";

export const prCreatedComment = (prUrl: string): string =>
  `Finished working on this request: ${prUrl}`;

export const pushFailedComment = (error: string): string =>
  `I couldn't push the branch automatically. Please investigate the following error:\n\n\`\`\`\n${error}\n\`\`\``;

export const agentFailedComment = (error: string): string =>
  `The agent failed while executing. Details:\n\n\`\`\`\n${error}\n\`\`\``;

export const prDescription = (summary: string, issueUrl: string, sessionId: string): string => `
## Summary
${summary}

## Related Issue
${issueUrl}

## Session ID
${sessionId}
`.trim();
