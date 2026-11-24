'use strict';

/**
 * Create a timestamped, consistent backup of the SQLite database.
 *   node src/scripts/backup.js
 * Uses SQLite's online backup API so it is safe to run while the server is live.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('../db');

fs.mkdirSync(config.paths.backups, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(config.paths.backups, `portal-${stamp}.db`);

db.backup(dest)
  .then(() => {
    console.log(`Backup written: ${dest}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backup failed:', err.message);
    process.exit(1);
  });
