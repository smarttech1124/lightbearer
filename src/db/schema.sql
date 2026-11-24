-- Light Bearers Picnic Portal — database schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',          -- 'superadmin' | 'admin' | 'verifier'
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  reference       TEXT NOT NULL UNIQUE,
  verify_token    TEXT NOT NULL UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT NOT NULL,
  gender          TEXT NOT NULL,                          -- 'Male' | 'Female'
  is_worker       INTEGER NOT NULL DEFAULT 0,
  department      TEXT,
  group_name      TEXT NOT NULL,
  fee_tier        TEXT NOT NULL,                          -- 'early_bird' | 'regular'
  fee_amount      INTEGER NOT NULL,                       -- expected amount in NGN
  amount_paid     INTEGER,                                -- amount confirmed by admin
  payment_status  TEXT NOT NULL DEFAULT 'awaiting_payment',
                  -- 'awaiting_payment' | 'pending_verification' | 'confirmed' | 'rejected'
  admin_remark    TEXT,
  verified_by     INTEGER REFERENCES admins(id),
  verified_at     TEXT,
  checked_in      INTEGER NOT NULL DEFAULT 0,
  checked_in_at   TEXT,
  checked_in_by   INTEGER REFERENCES admins(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participants_group   ON participants(group_name);
CREATE INDEX IF NOT EXISTS idx_participants_status  ON participants(payment_status);
CREATE INDEX IF NOT EXISTS idx_participants_tier    ON participants(fee_tier);
CREATE INDEX IF NOT EXISTS idx_participants_email   ON participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_phone   ON participants(phone);
CREATE INDEX IF NOT EXISTS idx_participants_created ON participants(created_at);

CREATE TABLE IF NOT EXISTS receipts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  stored_name    TEXT NOT NULL,
  original_name  TEXT,
  mime           TEXT,
  size           INTEGER,
  sha256         TEXT,
  is_current     INTEGER NOT NULL DEFAULT 1,
  uploaded_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_receipts_participant ON receipts(participant_id);

CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  channel        TEXT NOT NULL,                           -- 'email' | 'whatsapp'
  kind           TEXT NOT NULL,                           -- 'registration' | 'receipt_admin' | 'payment_confirmed' | 'payment_rejected'
  recipient      TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',         -- 'pending' | 'sent' | 'failed'
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  payload        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_part   ON notifications(participant_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  admin_email TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
