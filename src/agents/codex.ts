import { spawn } from 'node:child_process';
import { Config } from '../config';
import { AgentResult, IAgentBackend } from './types';

const CODex_BINARY = 'codex';

export class CodexAgent implements IAgentBackend {
  async run(prompt: string, repoPath: string, sessionId: string): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      try {
        const child = spawn(CODex_BINARY, ['--auto-approve'], {
          cwd: repoPath,
          env: { ...process.env, OPENAI_API_KEY: Config.openAiKey ?? '' },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        child.stdout?.on('data', (chunk) => stdoutChunks.push(String(chunk)));
        child.stderr?.on('data', (chunk) => stderrChunks.push(String(chunk)));

        child.on('close', (code) => {
          const combined = stdoutChunks.join('');
          const summaryText = combined.split('\n').filter(Boolean).pop() ?? 'Codex completed';
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
              error: stderrChunks.join('').trim() || 'Codex agent failed'
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
