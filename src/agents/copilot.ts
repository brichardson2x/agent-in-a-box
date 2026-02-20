import { spawn } from 'node:child_process';
import { AgentResult, IAgentBackend } from './types';
import { normalizeAgentAuthError } from './auth-errors';
import { Config } from '../config';

const COPILOT_BINARY = 'copilot';

export class CopilotAgent implements IAgentBackend {
  async run(prompt: string, repoPath: string, sessionId: string): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      try {
        const args = ['--yolo', '--no-ask-user', '--no-color', '--no-alt-screen'];
        if (Config.modelSelectionMode === 'custom' && Config.copilotModel !== 'default') {
          args.push('--model', Config.copilotModel);
        }
        args.push('--prompt', prompt);

        // Copilot auth must already be completed on the host via `copilot login`.
        const child = spawn(COPILOT_BINARY, args, {
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
          const summaryText = stdout.split('\n').filter(Boolean).pop() ?? 'Copilot completed';
          if (code === 0 && !authError) {
            resolve({
              success: true,
              summary: summaryText,
              filesChanged: [],
              error: undefined
            });
            return;
          }

          resolve({
            success: false,
            summary: `Copilot failed (${sessionId})`,
            filesChanged: [],
            error:
              authError ||
              stderr.trim() ||
              stdout.trim() ||
              'Copilot agent failed'
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
