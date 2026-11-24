'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// Ensure data directory exists
fs.mkdirSync(config.paths.data, { recursive: true });

const db = new Database(config.paths.db);
db.pragma('journal_mode = WAL');      // better concurrency: readers don't block the single writer
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');     // wait up to 5s if the writer is briefly locked
db.pragma('synchronous = NORMAL');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Seed default settings if absent
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`
  );
  upsert.run('registration_open', 'true');
}

function getSetting(key, def = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, String(value));
}

// Run migrations as soon as the DB module is first imported. Several service
// modules prepare SQL statements at load time, so the schema must already exist
// before any of them is required — this guarantees correct ordering regardless
// of which module is the entry point.
migrate();

module.exports = { db, migrate, getSetting, setSetting };
