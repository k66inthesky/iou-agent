// Seeds fake transactions so you can demo the balance math + cron without
// needing a live LINE group. Run with `npm run demo:seed`.
//
// All names are fictional. Real LINE group/user IDs never appear in the repo.

import { insertTransaction, netBalances, upsertMember } from '../src/db.js';

const GROUP_ID = 'C-demo-fixture-group';

for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
  upsertMember({ groupId: GROUP_ID, userId: `U-fake-${name}`, displayName: name });
}

const txs = [
  { debtor: 'Alice', creditor: 'Bob',   amount: 200, reason: '午餐' },
  { debtor: 'Bob',   creditor: 'Alice', amount: 50,  reason: '回 Alice 一部分' },
  { debtor: 'Carol', creditor: 'Bob',   amount: 350, reason: '高鐵票' },
  { debtor: 'Alice', creditor: 'Carol', amount: 80,  reason: '飲料' },
  { debtor: 'Dave',  creditor: 'Alice', amount: 1200,reason: '機票分攤' },
];

for (const t of txs) {
  insertTransaction({ groupId: GROUP_ID, currency: 'TWD', ...t });
}

console.log(`Seeded ${txs.length} transactions for group ${GROUP_ID}\n`);
console.log('Current net balances:');
for (const b of netBalances(GROUP_ID)) {
  console.log(`  ${b.debtor} 欠 ${b.creditor}: ${b.amount} ${b.currency}`);
}
