import 'dotenv/config';
import { extractIouEvents } from '../src/nemotron.js';

const members = [
  { display_name: 'Alice' },
  { display_name: 'Bob' },
  { display_name: 'Carol' },
];

const cases = [
  { sender: 'Alice', message: '我幫 Bob 墊了午餐 200' },
  { sender: 'Bob', message: '剛剛還 Alice 100 了' },
  { sender: 'Carol', message: '大家今天天氣真好' },
  { sender: 'Alice', message: 'Bob 你還欠我 350 高鐵票' },
];

for (const c of cases) {
  const out = await extractIouEvents({
    groupId: 'test-group',
    members,
    recent: [],
    message: c.message,
    sender: c.sender,
  });
  console.log('---');
  console.log(`[${c.sender}] ${c.message}`);
  console.log(JSON.stringify(out, null, 2));
}
