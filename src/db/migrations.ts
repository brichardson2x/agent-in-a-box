import { getDatabase } from './client';

type Migration = {
  id: string;
  up: () => void;
};

const migrations: Migration[] = [
  {
    id: '001-create-sessions',
    up: () => {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL,
          pr_id TEXT,
          platform TEXT NOT NULL,
          repo TEXT NOT NULL,
          branch TEXT,
          history TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    }
  }
];

export const runMigrations = (): void => {
  const db = getDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);');
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?);');
  const exists = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1;');

  for (const migration of migrations) {
    const alreadyApplied = exists.get(migration.id);
    if (alreadyApplied) {
      continue;
    }

    migration.up();
    insert.run(migration.id, Date.now());
  }
};
