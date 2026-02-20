import { AgentResult, IAgentBackend } from './types';
import { Config } from '../config';

export class CopilotAgent implements IAgentBackend {
  async run(_prompt: string, _repoPath: string, _sessionId: string): Promise<AgentResult> {
    void _prompt;
    void _repoPath;
    void _sessionId;
    if (!Config.copilotToken) {
      return {
        success: false,
        summary: 'Copilot token missing',
        filesChanged: [],
        error: 'COPILOT_TOKEN is required for the Copilot agent'
      };
    }
    return {
      success: false,
      summary: 'Copilot agent is not implemented in this environment',
      filesChanged: [],
      error: 'Copilot SDK integration requires additional setup'
    };
  }
}
