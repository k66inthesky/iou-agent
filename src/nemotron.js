import OpenAI from 'openai';
import { applyInputGuardrails, applyOutputGuardrails } from './guardrails.js';

let _client;
function client() {
  if (_client) return _client;
  if (!process.env.NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY is not set. Get one at https://build.nvidia.com/ and put it in .env');
  }
  _client = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: process.env.NEMOTRON_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    timeout: Number(process.env.NEMOTRON_TIMEOUT_MS || 25_000),
    maxRetries: 1,
  });
  return _client;
}

const MODEL = () => process.env.NEMOTRON_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

const SYSTEM_PROMPT = `You are an IOU (debt) tracker for a LINE group chat. Users speak Traditional Chinese, English, or a mix.

Your job: read the latest message in conversational context (members, current balances, recent messages, who is speaking) and produce a JSON object describing how this message changes the debt graph — if at all. You are a strong language model; use your full understanding of Chinese / English semantics, idiom, tense, modality, and sarcasm. Do not rely on surface patterns.

Output schema (always emit, even when nothing changes):
{
  "is_iou_related": boolean,
  "events": [
    {"type": "debt"|"settle", "debtor": "<name>", "creditor": "<name>", "amount": <positive number>, "currency": "TWD"|"USD"|..., "reason": "<short>"}
  ],
  "human_summary_zh": "<one short sentence in Traditional Chinese, or empty string>"
}

Event types:
- "debt"   — debtor now owes creditor MORE than before (a new advance, loan, or someone covering for someone else)
- "settle" — debtor has paid creditor back, reducing existing debt

What you decide, by understanding intent:
- Is this message describing an actual money movement, or something else (chit-chat, a question, a wish, a plan, a joke)? Only completed money movements produce events. Future/conditional/hypothetical statements ("希望", "想", "可以借嗎", "打算", "如果") are NOT transactions.
- For each line in the message (LINE users press Enter mid-message), decide independently. A message can produce 0, 1, or many events.
- If the message implies someone is "all clear" with the sender or with each other (clearance / settlement of the full balance), look up the relevant pair in the "Current balances" section and emit a settle event with that exact amount. If the pair has no listed balance, the line produces no event.
- "我"/"I" refers to the sender, whose name appears at "NEW MESSAGE from <name>". Other pronouns ("你", "他", "她") refer to participants — use your judgment to resolve from context.
- A line where debtor and creditor would be the same person produces no event; other lines in the same message are still processed.

Hard constraints (these the system will enforce; obey them to avoid your output being discarded):
- "amount" must be a positive number greater than zero.
- "debtor" and "creditor" must be different non-empty strings.
- Currency defaults to "TWD" if the user did not specify one. Use ISO 4217 three-letter codes.
- **Copy names exactly as the user typed them in the new message** — including emoji, case, punctuation, hyphens. Do not substitute a previously-seen name for the one in the new message; do not normalize case or transliterate.
- Output JSON only. No prose, no code fences, no commentary.`;

export async function extractIouEvents({ groupId, members, recent, message, sender, balances = [] }) {
  const guarded = applyInputGuardrails({ message, members });
  if (guarded.blocked) {
    return { is_iou_related: false, events: [], human_summary_zh: '', blocked: guarded.reason };
  }

  const memberLines = members.map(m => `- ${m.display_name}`).join('\n') || '(unknown)';
  const recentLines = recent.map(r => `${r.display_name ?? 'unknown'}: ${r.text}`).join('\n') || '(none)';
  const balanceLines = balances.length
    ? balances.map(b => `- ${b.debtor} owes ${b.creditor} ${b.amount} ${b.currency}`).join('\n')
    : '(no outstanding debts)';

  const userPrompt = `Group: ${groupId}
Members:
${memberLines}

Current balances (use these exact amounts when the user says someone is "all clear" / "沒欠我了"):
${balanceLines}

Recent messages (oldest → newest):
${recentLines}

NEW MESSAGE from ${sender}: ${message}

Return the JSON object now.`;

  const completion = await client().chat.completions.create({
    model: MODEL(),
    temperature: 0.1,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { parsed = { is_iou_related: false, events: [], human_summary_zh: '' }; }
  return applyOutputGuardrails(parsed, { members });
}

export async function composeDailySummary({ groupName, balances }) {
  if (balances.length === 0) {
    return '📒 IOU 日報：目前群裡沒有欠款紀錄，乾乾淨淨！';
  }
  const lines = balances
    .map(b => `• ${b.debtor} 欠 ${b.creditor} ${b.amount} ${b.currency}`)
    .join('\n');
  return `📒 IOU 日報（${new Date().toLocaleDateString('zh-TW', { timeZone: process.env.DAILY_SUMMARY_TZ || 'Asia/Taipei' })}）\n${lines}`;
}
