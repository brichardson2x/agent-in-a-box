import { AgentResult, IAgentBackend } from './types';

export class CopilotAgent implements IAgentBackend {
  async run(_prompt: string, _repoPath: string, _sessionId: string): Promise<AgentResult> {
    void _prompt;
    void _repoPath;
    void _sessionId;
    return {
      success: false,
      summary: 'Copilot agent is not implemented in this environment',
      filesChanged: [],
      error: 'Copilot SDK integration requires additional setup'
    };
  }
}
