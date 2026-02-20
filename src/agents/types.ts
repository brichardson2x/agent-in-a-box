export interface AgentResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  error?: string;
}

export interface IAgentBackend {
  run(prompt: string, repoPath: string, sessionId: string): Promise<AgentResult>;
}
