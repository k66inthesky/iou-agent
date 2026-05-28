import cron from 'node-cron';
import { knownGroupIds, netBalances } from './db.js';
import { composeDailySummary } from './nemotron.js';

export function startScheduler({ lineClient }) {
  const expr = process.env.DAILY_SUMMARY_CRON || '0 9 * * *';
  const tz = process.env.DAILY_SUMMARY_TZ || 'Asia/Taipei';
  if (!cron.validate(expr)) throw new Error(`Invalid DAILY_SUMMARY_CRON: ${expr}`);
  console.log(`[scheduler] daily summary cron="${expr}" tz=${tz}`);
  cron.schedule(expr, () => runDailySummary({ lineClient }).catch(err => {
    console.error('[scheduler] failed', err);
  }), { timezone: tz });
}

export async function runDailySummary({ lineClient }) {
  const groups = knownGroupIds();
  console.log(`[scheduler] running daily summary for ${groups.length} group(s)`);
  for (const groupId of groups) {
    const balances = netBalances(groupId);
    const text = await composeDailySummary({ groupName: groupId, balances });
    try {
      await lineClient.pushMessage(groupId, { type: 'text', text });
      console.log(`[scheduler] pushed to ${groupId}`);
    } catch (err) {
      console.error(`[scheduler] push failed for ${groupId}`, err?.statusMessage ?? err);
    }
  }
}
