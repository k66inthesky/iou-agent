import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'iou.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  line_message_id TEXT PRIMARY KEY,
  group_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  display_name    TEXT,
  text            TEXT NOT NULL,
  ts              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  group_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id            TEXT NOT NULL,
  debtor              TEXT NOT NULL,
  creditor            TEXT NOT NULL,
  amount              REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'TWD',
  reason              TEXT,
  source_message_id   TEXT,
  created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_msg_group ON messages(group_id, ts);
`);

export function saveMessage({ id, groupId, userId, displayName, text, ts }) {
  const info = db.prepare(`INSERT OR IGNORE INTO messages
    (line_message_id, group_id, user_id, display_name, text, ts)
    VALUES (?,?,?,?,?,?)`).run(id, groupId, userId, displayName ?? null, text, ts);
  return { isNew: info.changes === 1 };
}

export function upsertMember({ groupId, userId, displayName }) {
  db.prepare(`INSERT INTO members (group_id, user_id, display_name)
    VALUES (?,?,?)
    ON CONFLICT(group_id, user_id) DO UPDATE SET display_name = excluded.display_name`)
    .run(groupId, userId, displayName);
}

export function listMembers(groupId) {
  return db.prepare(`SELECT user_id, display_name FROM members WHERE group_id = ?`).all(groupId);
}

export function recentMessages(groupId, limit = 12) {
  return db.prepare(`SELECT display_name, text, ts FROM messages
    WHERE group_id = ? ORDER BY ts DESC LIMIT ?`).all(groupId, limit).reverse();
}

export function insertTransaction({ groupId, debtor, creditor, amount, currency = 'TWD', reason, sourceMessageId }) {
  if (debtor === creditor) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const stmt = db.prepare(`INSERT INTO transactions
    (group_id, debtor, creditor, amount, currency, reason, source_message_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const info = stmt.run(groupId, debtor, creditor, amount, currency, reason ?? null, sourceMessageId ?? null, Date.now());
  return info.lastInsertRowid;
}

// Returns net balances per ordered pair (A→B = how much A owes B, after netting).
export function netBalances(groupId) {
  const rows = db.prepare(`
    SELECT debtor, creditor, currency, SUM(amount) AS total
    FROM transactions WHERE group_id = ?
    GROUP BY debtor, creditor, currency
  `).all(groupId);
  const map = new Map();
  const key = (a, b, c) => `${a}${b}${c}`;
  for (const r of rows) map.set(key(r.debtor, r.creditor, r.currency), r.total);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k1 = key(r.debtor, r.creditor, r.currency);
    const k2 = key(r.creditor, r.debtor, r.currency);
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2);
    const a = map.get(k1) ?? 0;
    const b = map.get(k2) ?? 0;
    const net = a - b;
    if (Math.abs(net) < 0.01) continue;
    if (net > 0) out.push({ debtor: r.debtor, creditor: r.creditor, amount: net, currency: r.currency });
    else out.push({ debtor: r.creditor, creditor: r.debtor, amount: -net, currency: r.currency });
  }
  return out;
}

export function knownGroupIds() {
  return db.prepare(`SELECT DISTINCT group_id FROM messages`).all().map(r => r.group_id);
}

export function recentTransactions(groupId, limit = 50) {
  return db.prepare(`SELECT debtor, creditor, amount, currency, reason, source_message_id, created_at
    FROM transactions WHERE group_id = ? ORDER BY id DESC LIMIT ?`).all(groupId, limit);
}

export default db;
