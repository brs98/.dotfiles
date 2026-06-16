#!/usr/bin/env node
// idea-score.mjs — weighted Hormozi+YC startup-idea scorecard → GO / PIVOT / KILL.
// Usage:
//   node idea-score.mjs --json '{"problem_intensity":4,"problem_frequency":3,...}'
//   node idea-score.mjs --problem_intensity 4 --willingness_to_pay 2 ...
// Every dimension is 0–5. Missing dimensions default to 0 and are flagged.

const DIMS = [
  { key: 'problem_intensity',   weight: 3, label: 'Problem intensity (pain/urgency)' },
  { key: 'problem_frequency',   weight: 2, label: 'Problem frequency' },
  { key: 'market',              weight: 2, label: 'Market size & growth' },
  { key: 'willingness_to_pay',  weight: 3, label: 'Willingness to pay' },
  { key: 'reachability',        weight: 2, label: 'Reachability (easy to target)' },
  { key: 'unfair_advantage',    weight: 2, label: 'Unfair advantage / founder-market fit' },
  { key: 'differentiation',     weight: 2, label: 'Differentiation (10x?)' },
  { key: 'timing',              weight: 1, label: 'Timing (why now?)' },
  { key: 'tarpit_risk',         weight: 2, label: 'Tarpit risk (reverse-scored)', reverse: true },
  { key: 'demand_evidence',     weight: 3, label: 'Real demand evidence' },
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { Object.assign(out, JSON.parse(argv[++i] ?? '{}')); continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = Number(next); i++; }
      else out[key] = 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || Object.keys(args).length === 0) {
  console.log('Score 0–5 per dimension:\n' + DIMS.map(d => `  --${d.key}${d.reverse ? '  (reverse: 5=worst)' : ''}`).join('\n'));
  console.log('\nExample:\n  node idea-score.mjs --json \'{"problem_intensity":4,"problem_frequency":3,"market":3,"willingness_to_pay":2,"reachability":4,"unfair_advantage":3,"differentiation":3,"timing":4,"tarpit_risk":1,"demand_evidence":1}\'');
  process.exit(0);
}

const clamp = n => Math.max(0, Math.min(5, Number.isFinite(n) ? n : 0));
const missing = [];
let earned = 0, max = 0;
const rows = DIMS.map(d => {
  const raw = args[d.key];
  if (raw === undefined) missing.push(d.key);
  const v = clamp(raw);
  const effective = d.reverse ? (5 - v) : v;   // reverse: high tarpit_risk subtracts
  earned += effective * d.weight;
  max += 5 * d.weight;
  return { ...d, v, contrib: effective * d.weight, maxContrib: 5 * d.weight };
});

const pct = Math.round((earned / max) * 1000) / 10;

// Banding
let band, reasons = [];
if (pct >= 70) band = 'GO';
else if (pct >= 45) band = 'PIVOT';
else band = 'KILL';

// Gating overrides
const evidence = clamp(args.demand_evidence ?? 0);
const tarpit = clamp(args.tarpit_risk ?? 0);
if (evidence < 2 && band === 'GO') { band = 'PIVOT'; reasons.push('No real demand evidence yet (demand_evidence < 2) — this is a hypothesis, not validation. Run the test before any GO.'); }
if (tarpit >= 4 && band === 'GO') { band = 'PIVOT'; reasons.push('High tarpit risk (>=4): easy praise + many prior failures. Be extra skeptical.'); }

// Output
const bar = n => '█'.repeat(n) + '·'.repeat(5 - n);
console.log('\n  STARTUP-IDEA SCORECARD (Hormozi × YC)\n  ' + '─'.repeat(46));
for (const r of rows) {
  const shown = r.reverse ? `${r.v} (risk)` : `${r.v}`;
  console.log(`  ${bar(r.v)}  ${shown.padStart(8)}  ×${r.weight}  ${r.label}`);
}
console.log('  ' + '─'.repeat(46));
console.log(`  Weighted score: ${earned} / ${max}  (${pct}%)`);
console.log(`  VERDICT: ${band}`);
if (reasons.length) reasons.forEach(r => console.log(`   ⚠ ${r}`));
if (missing.length) console.log(`   (note: defaulted to 0 — unscored: ${missing.join(', ')})`);
console.log('  Bands: GO ≥ 70% · PIVOT 45–70% · KILL < 45% · gated on demand_evidence & tarpit_risk\n');
