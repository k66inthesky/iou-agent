// Policy-based guardrails for iou-agent.
//
// Philosophy: trust the LLM for natural-language interpretation (names,
// pronouns, intent). Only enforce things that protect the database from
// hallucinated or overflowing data — numeric range, enums, self-reference,
// length caps. Do NOT pattern-match person names; that's the LLM's job and
// the user may use any unicode nickname.
//
// These run on every Nemotron call. When iou-agent is deployed behind
// NemoClaw on a compatible host (see docs/nemoclaw.md), the same intent is
// additionally enforced at the network/process layer by NemoClaw's sandbox.

const MAX_MESSAGE_CHARS = 2000;
const MAX_AMOUNT = 1_000_000; // sanity cap per single event
const MAX_NAME_CHARS = 80;    // pure DB-overflow guard, not a name-validity check

// Block obviously hostile prompts trying to manipulate the agent.
const PROMPT_INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior) (instructions|prompts)/i,
  /system prompt/i,
  /you are now/i,
  /忽略(以上|前面|先前)的?指[示令]/,
  /扮演.*系統/,
];

export function applyInputGuardrails({ message, members }) {
  if (typeof message !== 'string') return { blocked: true, reason: 'non-string message' };
  if (message.length > MAX_MESSAGE_CHARS) return { blocked: true, reason: 'message too long' };
  for (const pat of PROMPT_INJECTION_PATTERNS) {
    if (pat.test(message)) return { blocked: true, reason: 'suspected prompt injection' };
  }
  if (!Array.isArray(members)) return { blocked: true, reason: 'members missing' };
  return { blocked: false };
}

export function applyOutputGuardrails(parsed, _ctx) {
  const result = {
    is_iou_related: Boolean(parsed?.is_iou_related),
    events: [],
    human_summary_zh: typeof parsed?.human_summary_zh === 'string' ? parsed.human_summary_zh.slice(0, 200) : '',
  };
  const events = Array.isArray(parsed?.events) ? parsed.events : [];
  for (const ev of events) {
    if (ev?.type !== 'debt' && ev?.type !== 'settle') continue;
    const debtor = typeof ev.debtor === 'string' ? ev.debtor.trim() : '';
    const creditor = typeof ev.creditor === 'string' ? ev.creditor.trim() : '';
    if (!debtor || !creditor || debtor === creditor) continue;
    if (debtor.length > MAX_NAME_CHARS || creditor.length > MAX_NAME_CHARS) continue;
    const amount = Number(ev.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;
    const currency = typeof ev.currency === 'string' && /^[A-Z]{3}$/.test(ev.currency) ? ev.currency : 'TWD';
    result.events.push({
      type: ev.type,
      debtor,
      creditor,
      amount,
      currency,
      reason: typeof ev.reason === 'string' ? ev.reason.slice(0, 120) : '',
    });
  }
  if (result.events.length === 0) result.is_iou_related = false;
  return result;
}
