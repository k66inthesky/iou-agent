// Pure-JS JSON-file store. Same exported API as the original better-sqlite3
// version so callers don't change. Trade-off: O(n) reads instead of indexed
// SQL — fine at IOU-tracker scale (tens to thousands of messages per group).
// Native deps removed so iou-agent runs inside a NemoClaw sandbox without
// rebuilding for the sandbox's glibc.

import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'iou.json');

function loadState() {
  if (!fs.existsSync(DB_PATH)) {
    return { messages: {}, members: {}, transactions: [], nextTxId: 1 };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return {
      messages: raw.messages || {},
      members: raw.members || {},
      transactions: raw.transactions || [],
      nextTxId: raw.nextTxId || (raw.transactions?.length + 1 || 1),
    };
  } catch {
    return { messages: {}, members: {}, transactions: [], nextTxId: 1 };
  }
}

const state = loadState();

function save() {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_PATH);
}

export function saveMessage({ id, groupId, userId, displayName, text, ts }) {
  if (state.messages[id]) return { isNew: false };
  state.messages[id] = { groupId, userId, displayName: displayName ?? null, text, ts };
  save();
  return { isNew: true };
}

export function upsertMember({ groupId, userId, displayName }) {
  const key = `${groupId}${userId}`;
  state.members[key] = { groupId, userId, displayName };
  save();
}

export function listMembers(groupId) {
  return Object.values(state.members)
    .filter(m => m.groupId === groupId)
    .map(m => ({ user_id: m.userId, display_name: m.displayName }));
}

export function recentMessages(groupId, limit = 12) {
  return Object.values(state.messages)
    .filter(m => m.groupId === groupId)
    .sort((a, b) => a.ts - b.ts)
    .slice(-limit)
    .map(m => ({ display_name: m.displayName, text: m.text, ts: m.ts }));
}

export function insertTransaction({ groupId, debtor, creditor, amount, currency = 'TWD', reason, sourceMessageId }) {
  if (debtor === creditor) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const id = state.nextTxId++;
  state.transactions.push({
    id,
    groupId,
    debtor,
    creditor,
    amount,
    currency,
    reason: reason ?? null,
    sourceMessageId: sourceMessageId ?? null,
    createdAt: Date.now(),
  });
  save();
  return id;
}

export function netBalances(groupId) {
  const grouped = new Map();
  const key = (a, b, c) => `${a}${b}${c}`;
  for (const t of state.transactions) {
    if (t.groupId !== groupId) continue;
    const k = key(t.debtor, t.creditor, t.currency);
    grouped.set(k, (grouped.get(k) ?? 0) + t.amount);
  }
  const seen = new Set();
  const out = [];
  for (const [k, total] of grouped) {
    const [debtor, creditor, currency] = k.split('');
    const reverse = key(creditor, debtor, currency);
    if (seen.has(k) || seen.has(reverse)) continue;
    seen.add(k);
    seen.add(reverse);
    const a = total;
    const b = grouped.get(reverse) ?? 0;
    const net = a - b;
    if (Math.abs(net) < 0.01) continue;
    if (net > 0) out.push({ debtor, creditor, amount: net, currency });
    else out.push({ debtor: creditor, creditor: debtor, amount: -net, currency });
  }
  return out;
}

export function knownGroupIds() {
  return [...new Set(Object.values(state.messages).map(m => m.groupId))];
}

export function recentTransactions(groupId, limit = 50) {
  return state.transactions
    .filter(t => t.groupId === groupId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map(t => ({
      debtor: t.debtor,
      creditor: t.creditor,
      amount: t.amount,
      currency: t.currency,
      reason: t.reason,
      source_message_id: t.sourceMessageId,
      created_at: t.createdAt,
    }));
}

export default state;
