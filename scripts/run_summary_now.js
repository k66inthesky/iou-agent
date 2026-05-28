import 'dotenv/config';
import { Client as LineClient } from '@line/bot-sdk';
import { runDailySummary } from '../src/scheduler.js';

const lineClient = new LineClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

await runDailySummary({ lineClient });
process.exit(0);
