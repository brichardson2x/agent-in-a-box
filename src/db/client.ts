import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { Config } from '../config';

let instance: Database.Database | null = null;

export const openDatabase = (): Database.Database => {
  if (instance) {
    return instance;
  }

  const dir = path.dirname(Config.sqlitePath);
  fs.mkdirSync(dir, { recursive: true });

  instance = new Database(Config.sqlitePath, { verbose: undefined });
  return instance;
};

export const getDatabase = (): Database.Database => {
  return openDatabase();
};

export const overrideDatabase = (db: Database.Database): void => {
  instance = db;
};
