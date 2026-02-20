import { Config } from '../config';
import { CopilotAgent } from './copilot';
import { CodexAgent } from './codex';
import { IAgentBackend } from './types';

export const getAgent = (): IAgentBackend => {
  if (Config.agent.toLowerCase() === 'codex') {
    return new CodexAgent();
  }
  return new CopilotAgent();
};
