import { spawn } from 'node:child_process';
import { AgentResult, IAgentBackend } from './types';
import { normalizeAgentAuthError } from './auth-errors';
import { Config } from '../config';

const CODex_BINARY = 'codex';

export class CodexAgent implements IAgentBackend {
  async run(prompt: string, repoPath: string, sessionId: string): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      try {
        const args = ['--auto-approve'];
        if (Config.modelSelectionMode === 'custom' && Config.codexModel !== 'default') {
          args.push('--model', Config.codexModel);
        }

        // Codex CLI auth must already be completed on the host via `codex auth`.
        const child = spawn(CODex_BINARY, args, {
          cwd: repoPath,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        child.stdout?.on('data', (chunk) => stdoutChunks.push(String(chunk)));
        child.stderr?.on('data', (chunk) => stderrChunks.push(String(chunk)));
        child.on('error', (error) => {
          resolve({
            success: false,
            summary: `Codex failed (${sessionId})`,
            filesChanged: [],
            error: (error as Error).message
          });
        });

        child.on('close', (code) => {
          const stdout = stdoutChunks.join('');
          const stderr = stderrChunks.join('');
          const summaryText = stdout.split('\n').filter(Boolean).pop() ?? 'Codex completed';
          if (code === 0) {
            resolve({
              success: true,
              summary: summaryText,
              filesChanged: [],
              error: undefined
            });
          } else {
            resolve({
              success: false,
              summary: `Codex failed (${sessionId})`,
              filesChanged: [],
              error:
                normalizeAgentAuthError('codex', stdout, stderr) ||
                stderr.trim() ||
                stdout.trim() ||
                'Codex agent failed'
            });
          }
        });

        child.stdin?.write(prompt);
        child.stdin?.end();
      } catch (error) {
        resolve({
          success: false,
          summary: 'Codex binary unavailable',
          filesChanged: [],
          error: (error as Error).message
        });
      }
    });
  }
}
