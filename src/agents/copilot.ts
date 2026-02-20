import { spawn } from 'node:child_process';
import { AgentResult, IAgentBackend } from './types';
import { normalizeAgentAuthError } from './auth-errors';

export class CopilotAgent implements IAgentBackend {
  async run(_prompt: string, repoPath: string, sessionId: string): Promise<AgentResult> {
    void _prompt;
    return new Promise<AgentResult>((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      try {
        // Copilot auth must already be completed on the host via `gh auth login`.
        const child = spawn('gh', ['auth', 'status'], {
          cwd: repoPath,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout?.on('data', (chunk) => stdoutChunks.push(String(chunk)));
        child.stderr?.on('data', (chunk) => stderrChunks.push(String(chunk)));
        child.on('error', (error) => {
          resolve({
            success: false,
            summary: `Copilot failed (${sessionId})`,
            filesChanged: [],
            error: (error as Error).message
          });
        });

        child.on('close', (code) => {
          const stdout = stdoutChunks.join('');
          const stderr = stderrChunks.join('');
          const authError = normalizeAgentAuthError('copilot', stdout, stderr);
          if (code !== 0 || authError) {
            resolve({
              success: false,
              summary: `Copilot failed (${sessionId})`,
              filesChanged: [],
              error:
                authError ??
                'Copilot authentication check failed. Run `gh auth login` on the host, then `systemctl restart gitAgent`.'
            });
            return;
          }

          resolve({
            success: false,
            summary: 'Copilot agent is not implemented in this environment',
            filesChanged: [],
            error: 'Copilot backend setup is still required after host authentication.'
          });
        });
      } catch (error) {
        resolve({
          success: false,
          summary: `Copilot failed (${sessionId})`,
          filesChanged: [],
          error: (error as Error).message
        });
      }
    });
  }
}
