import { Config } from '../config';
import { gitlabAdapter } from './gitlab';
import { githubAdapter } from './github';
import { IPlatformAdapter } from './types';

export const getAdapter = (): IPlatformAdapter => {
  if (Config.platform === 'github') {
    return githubAdapter;
  }
  return gitlabAdapter;
};
