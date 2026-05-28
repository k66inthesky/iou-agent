import 'dotenv/config';
import express from 'express';
import { middleware as lineMiddleware, Client as LineClient } from '@line/bot-sdk';
import db, { saveMessage, upsertMember, recentMessages, listMembers, insertTransaction, netBalances, knownGroupIds, recentTransactions } from './db.js';
import { extractIouEvents } from './nemotron.js';
import { startScheduler } from './scheduler.js';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!config.channelAccessToken || !config.channelSecret) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET are required. See .env.example.');
  process.exit(1);
}

const lineClient = new LineClient(config);
const app = express();

app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/state', (_req, res) => {
  const groups = knownGroupIds().map(groupId => ({
    group_id: groupId,
    members: listMembers(groupId).map(m => m.display_name),
    balances: netBalances(groupId),
  }));
  res.json({ ts: Date.now(), groups });
});

app.get('/history', (req, res) => {
  const groups = knownGroupIds().map(groupId => ({
    group_id: groupId,
    transactions: recentTransactions(groupId, Number(req.query.limit) || 50)
      .map(t => ({ ...t, created_at_iso: new Date(t.created_at).toISOString() })),
  }));
  res.json({ ts: Date.now(), groups });
});

app.post('/webhook', lineMiddleware(config), async (req, res) => {
  res.status(200).end();
  const events = req.body.events ?? [];
  console.log(`[webhook] ${new Date().toISOString()} received ${events.length} event(s)`);
  for (const event of events) {
    try { await handleEvent(event); }
    catch (err) { console.error('[webhook] event failed', err); }
  }
});

async function resolveDisplayName(event) {
  const { source } = event;
  try {
    if (source.type === 'group') {
      const profile = await lineClient.getGroupMemberProfile(source.groupId, source.userId);
      return profile?.displayName;
    }
    if (source.type === 'room') {
      const profile = await lineClient.getRoomMemberProfile(source.roomId, source.userId);
      return profile?.displayName;
    }
    const profile = await lineClient.getProfile(source.userId);
    return profile?.displayName;
  } catch {
    return null;
  }
}

async function handleEvent(event) {
  console.log(`[event] type=${event.type} source=${event.source?.type ?? '?'} msg=${event.message?.type ?? '-'}`);
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const source = event.source;
  console.log(`[msg] text=${JSON.stringify(event.message.text)}`);
  if (source.type !== 'group') {
    // Outside groups we just acknowledge.
    if (event.replyToken) {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '把我加進群組，我會在裡面幫大家記帳～',
      });
    }
    return;
  }

  const groupId = source.groupId;
  const userId = source.userId;
  const text = event.message.text;
  const ts = event.timestamp;
  const displayName = (await resolveDisplayName(event)) ?? userId.slice(-6);

  upsertMember({ groupId, userId, displayName });
  const { isNew } = saveMessage({ id: event.message.id, groupId, userId, displayName, text, ts });
  if (!isNew) {
    console.log(`[dedup] message ${event.message.id} already processed; skipping`);
    return;
  }

  const members = listMembers(groupId);
  const recent = recentMessages(groupId, 10);
  const currentBalances = netBalances(groupId);

  let parsed;
  try {
    parsed = await extractIouEvents({
      groupId,
      members,
      recent,
      message: text,
      sender: displayName,
      balances: currentBalances,
    });
  } catch (err) {
    console.error('[nemotron] extract failed', err?.message ?? err);
    return;
  }

  console.log(`[extract] is_iou=${parsed.is_iou_related} events=${parsed.events.length} from=${displayName} raw=${JSON.stringify(parsed.events)}`);
  if (!parsed.is_iou_related || parsed.events.length === 0) return;

  for (const ev of parsed.events) {
    if (ev.type === 'debt') {
      insertTransaction({
        groupId,
        debtor: ev.debtor,
        creditor: ev.creditor,
        amount: ev.amount,
        currency: ev.currency,
        reason: ev.reason,
        sourceMessageId: event.message.id,
      });
    } else if (ev.type === 'settle') {
      insertTransaction({
        groupId,
        debtor: ev.creditor,
        creditor: ev.debtor,
        amount: ev.amount,
        currency: ev.currency,
        reason: `[settle] ${ev.reason ?? ''}`.trim(),
        sourceMessageId: event.message.id,
      });
    }
  }

  const balances = netBalances(groupId);
  const summaryLines = balances.length
    ? balances.map(b => `• ${b.debtor} 欠 ${b.creditor} ${b.amount} ${b.currency}`).join('\n')
    : '（目前沒有未結欠款）';

  const replyText = `已更新紀錄，目前欠條：\n${summaryLines}`;
  try {
    await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyText });
  } catch (err) {
    console.error('[line] reply failed', err?.statusMessage ?? err);
  }
}

const port = Number(process.env.PORT || 3000);
const httpServer = app.listen(port, () => {
  console.log(`[iou-agent] listening on :${port}`);
  startScheduler({ lineClient });
});

function gracefulShutdown(signal) {
  console.log(`[iou-agent] received ${signal}, closing down`);
  httpServer.close(() => {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); console.log('[iou-agent] db closed'); }
    catch (err) { console.error('[iou-agent] db close failed', err); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
