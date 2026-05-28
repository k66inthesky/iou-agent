// Read-only CLI to inspect current iou-agent state across all known groups.
// Run with `npm run balances`. Safe to call while the server is running —
// SQLite WAL mode allows concurrent readers.

import { knownGroupIds, netBalances, listMembers } from '../src/db.js';

const groups = knownGroupIds();
if (groups.length === 0) {
  console.log('No groups seen yet. The bot needs to receive at least one message before any balances exist.');
  process.exit(0);
}

for (const groupId of groups) {
  const members = listMembers(groupId);
  const balances = netBalances(groupId);
  console.log(`\n=== Group ${groupId} (${members.length} member${members.length === 1 ? '' : 's'}) ===`);
  if (members.length) console.log('  Members: ' + members.map(m => m.display_name).join(', '));
  if (balances.length === 0) {
    console.log('  No outstanding debts.');
    continue;
  }
  for (const b of balances) {
    console.log(`  • ${b.debtor} 欠 ${b.creditor}: ${b.amount} ${b.currency}`);
  }
}
console.log();
