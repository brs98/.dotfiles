#!/usr/bin/env node
// cfa-calc.mjs — Client-Financed Acquisition check (Hormozi).
// Passes when 30-day gross profit >= 2 * (CAC + COGS): customer #1's early cash
// funds acquiring + fulfilling them, plus the next 1–2 → growth can self-fund.
//
// Usage:
//   node cfa-calc.mjs --price 96 --billing annual --upsell 49 --attach 25 --cac 40 --cogs 6
// Flags:
//   --price    headline plan price (treat as annual price if billing=annual)
//   --billing  annual | monthly        (default annual)
//   --upsell   point-of-sale upsell price        (default 0)
//   --attach   upsell attach rate, %             (default 0)
//   --cac      cost to acquire a customer        (default 0)
//   --cogs     cost to fulfill + fees per cust   (default 0)

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

const a = parseArgs(process.argv.slice(2));
if (a.help) {
  console.log('node cfa-calc.mjs --price 96 --billing annual --upsell 49 --attach 25 --cac 40 --cogs 6');
  process.exit(0);
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const price   = num(a.price);
const billing = (a.billing === 'monthly') ? 'monthly' : 'annual';
const upsell  = num(a.upsell);
const attach  = num(a.attach) / 100;
const cac     = num(a.cac);
const cogs    = num(a.cogs);

const upfront   = billing === 'annual' ? price : price / 12;
const upsellRev = upsell * attach;
const gp30      = upfront + upsellRev - cogs;
const threshold = 2 * (cac + cogs);
const pass      = gp30 >= threshold;
const ratio     = threshold > 0 ? gp30 / threshold : Infinity;

// crude payback (months) at the recurring rate, ignoring upsell
const monthly = billing === 'annual' ? price / 12 : price / 12;
const payback = monthly > 0 ? (cac + cogs) / monthly : Infinity;

const f = n => (Number.isFinite(n) ? `$${n.toFixed(2)}` : '—');
console.log('\n  CLIENT-FINANCED ACQUISITION CHECK\n  ' + '─'.repeat(42));
console.log(`  Billing: ${billing}   Day-one cash: ${f(upfront)}   Upsell: ${f(upsellRev)} (${(attach * 100).toFixed(0)}% × ${f(upsell)})`);
console.log(`  30-day gross profit:        ${f(gp30)}`);
console.log(`  Needs ≥ 2×(CAC+COGS):       ${f(threshold)}   (CAC ${f(cac)} + COGS ${f(cogs)})`);
console.log(`  Coverage ratio:             ${Number.isFinite(ratio) ? ratio.toFixed(2) + '×' : '—'}`);
console.log('  ' + '─'.repeat(42));
console.log(`  ${pass ? '✓ CFA PASSES — acquisition can self-fund' : '✗ CFA FAILS — cash-constrained growth'}`);
if (!pass) {
  console.log('   Fix it by: charging more · collecting annual/up-front · adding a point-of-sale upsell · cutting CAC.');
  if (Number.isFinite(payback)) console.log(`   (At this recurring rate, simple CAC payback ≈ ${payback.toFixed(1)} months.)`);
}
console.log('');
