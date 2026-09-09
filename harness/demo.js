/**
 * The closed loop — all three agents, multiple rounds, one shared state.
 *
 *   npm run demo
 *   npm run demo -- --sku SKU-1001 --second SKU-1006
 *
 * Three agents each answering a prompt is a workflow. What makes this a system
 * is that every agent's output changes what the others do next — in both
 * directions. This runs long enough to show that happening rather than assert it.
 *
 *   ROUND 1  discovery
 *     1a  Agent 1  assesses the listing            -> listingDecisionLog, reviewQueue
 *     1b  Agent 2  resolves the complaint          -> complaintPatternLog, returnSpikeFlags
 *     1c  Agent 3  triages the inventory           -> reads both, publishes an advisory
 *
 *   ROUND 2  the feedback flows backwards
 *     2a  Agent 2  handles a second complaint, and can now consult Agent 3
 *                  about whether replacement stock still exists
 *     2b  Agent 3  re-triages, now seeing Agent 2's newer signals
 *
 *   ROUND 3  back to where it started
 *     3a  Agent 1  re-assesses the SAME listing, now with two complaint
 *                  patterns in its category. Same input, more evidence.
 *
 * Nothing is seeded. Every signal any agent reads was written by another agent
 * during this run. Rounds are a bounded loop counter, not recursion — that is
 * what keeps a cyclic agent graph safe.
 */

import {
  reset,
  sharedState,
  snapshot,
  complaintPatternsFor,
  inventoryAdvisoryFor,
} from '../src/state.js';
import { getEnrichedSku } from '../src/data/loadData.js';
import { buildListingInput } from '../src/agents/registry.js';
import { assessSku } from '../src/agents/agent3_deadstock.js';
import { OR_MODEL } from '../src/openrouter.js';
import { MODEL as ANTHROPIC_MODEL } from '../src/llm.js';
import {
  renderHeader,
  renderSignals,
  renderThinking,
  renderToolCall,
  renderAgentCall,
  renderCard,
  wrap,
  dim,
  bold,
  WIDTH,
} from './render.js';

/* ------------------------------------------------------------------ *
 * Args
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};

/** The SKU the whole story is about. */
const SKU = (valueOf('--sku') ?? 'SKU-1001').toUpperCase();
/** A second SKU in the same category, so Agent 1's scrutiny can visibly rise. */
const SKU2 = (valueOf('--second') ?? 'SKU-1006').toUpperCase();

const hasAnthropic = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key) && !key.includes('paste-your-own');
};

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

const rule = (char = '─') => console.log(dim('  ' + char.repeat(WIDTH)));

function round(n, title) {
  console.log('');
  console.log('');
  rule('═');
  console.log(`  ${bold(`ROUND ${n}`)}   ${bold(title.toUpperCase())}`);
  rule('═');
}

function step(label, title, who) {
  console.log('');
  console.log(`  ${bold(label)}  ${title}`);
  console.log(`  ${dim('      ' + who)}`);
  console.log('');
}

/** Print only what changed, so the loop closing is visible rather than implied. */
function delta(before, after) {
  const lines = [];
  const grew = (key) => after[key].length - before[key].length;

  if (grew('listingDecisionLog') > 0) {
    const e = after.listingDecisionLog.at(-1);
    lines.push(`listingDecisionLog    +${grew('listingDecisionLog')}   ${e.sku_id} → ${e.decision}`);
  }
  if (grew('complaintPatternLog') > 0) {
    const e = after.complaintPatternLog.at(-1);
    lines.push(`complaintPatternLog   +${grew('complaintPatternLog')}   "${e.complaint_pattern_tag}" on ${e.product_category}`);
  }
  const spikes = Object.keys(after.returnSpikeFlags).filter(
    (s) => after.returnSpikeFlags[s] && !before.returnSpikeFlags[s]
  );
  if (spikes.length) lines.push(`returnSpikeFlags      +${spikes.length}   ${spikes.join(', ')} → true`);
  if (grew('reviewQueue') > 0) lines.push(`reviewQueue           +${grew('reviewQueue')}   awaiting a human`);
  if (grew('actionLedger') > 0) {
    const e = after.actionLedger.at(-1);
    lines.push(`actionLedger          +${grew('actionLedger')}   ${e.action ?? e.type ?? 'action'}${e.amount ? ' $' + e.amount : ''}`);
  }
  if (grew('inventoryAdvisoryLog') > 0) {
    const e = after.inventoryAdvisoryLog.at(-1);
    lines.push(
      `inventoryAdvisoryLog  +${grew('inventoryAdvisoryLog')}   ${e.sku_id}: replacements ${e.replacements_available ? 'available' : 'WITHDRAWN'}`
    );
  }

  if (lines.length === 0) {
    console.log(dim('\n     shared state unchanged — this agent only read'));
    return;
  }
  console.log(`\n     ${bold('wrote to shared state')}`);
  for (const l of lines) console.log(`       ${l}`);
}

/** The event handler every agent shares, so all three trace identically. */
const trace = {
  onEvent(event) {
    if (event.type === 'thinking') {
      const text = renderThinking(event.text);
      if (text) console.log(text);
    } else if (event.type === 'tool') {
      console.log(renderToolCall(event.name, event.result));
    } else if (event.type === 'agentCall') {
      console.log(renderAgentCall(event.name, event.result));
    }
  },
};

/* ------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------ */

const sku = getEnrichedSku(SKU);
if (!sku) {
  console.error(`\n  Unknown SKU: ${SKU}\n`);
  process.exit(1);
}

if (!hasAnthropic()) {
  console.error('\n  ANTHROPIC_API_KEY is not set — Agents 1 and 2 cannot run.');
  console.error('  Add it to .env (with COSMIC_ANTHROPIC_BASE_URL for voc- keys).\n');
  process.exit(1);
}

const { checkListing } = await import('../src/agents/agent1_factchecker.js');
const { loadComplaints, resolve } = await import('../src/agents/agent2_resolution.js');

reset();

console.log('');
console.log(`  ${bold('COSMICTRUST — THE CLOSED LOOP')}`);
console.log(dim(`  ${SKU} ${sku.product_name}  ·  second case ${SKU2}`));
console.log(dim(`  agents 1 & 2: ${ANTHROPIC_MODEL}    agent 3: ${OR_MODEL}`));

let before = snapshot();
const listing = buildListingInput(SKU);
const complaints = loadComplaints();

/* ================================================================== *
 * ROUND 1 — discovery
 * ================================================================== */

round(1, 'Discovery — a bad listing surfaces');

/* --- 1a ----------------------------------------------------------- */
step('1a', 'Assess the listing before it goes live', 'Agent 1 · Fact Checker');

console.log(`     ${dim('claims')}  ${wrap(listing.claims, WIDTH - 16)[0]}`);
for (const line of wrap(listing.claims, WIDTH - 16).slice(1, 2)) {
  console.log(`             ${dim(line)}`);
}

const r1a = await checkListing(listing);
console.log('');
console.log(renderCard({
  risk_level: r1a.decision === 'approved' ? 'low' : 'high',
  intervention: r1a.decision,
  reason: r1a.reason,
  estimated_recovery: r1a.recommendation_to_reviewer || 'no reviewer action required',
  weekly_brief_line: '',
}));
delta(before, snapshot());
before = snapshot();

/* --- 1b ----------------------------------------------------------- */
step('1b', 'A customer complains about exactly that claim', 'Agent 2 · Customer Resolution');

const c1 = complaints.find((row) => row.sku_id === SKU);
if (!c1) {
  console.log(dim(`     No complaint on file for ${SKU} — skipping.`));
} else {
  console.log(`     ${dim('customer')}  ${c1.customer_name} (${c1.emotional_tone})`);
  for (const line of wrap(c1.complaint_description, WIDTH - 16).slice(0, 2)) {
    console.log(`               ${dim(line)}`);
  }
  console.log('');

  const r1b = await resolve(c1, {
    onAgentCall: (name, args, result) => console.log(renderAgentCall(name, result)),
  });

  console.log('');
  console.log(renderCard({
    risk_level: r1b.escalate_to_human ? 'medium' : 'low',
    intervention: r1b.complaint_pattern_tag,
    reason: r1b.action_taken,
    estimated_recovery: r1b.escalate_to_human ? 'escalated to a human' : 'resolved by the agent',
    weekly_brief_line: '',
  }));
  delta(before, snapshot());
  before = snapshot();
}

/* --- 1c ----------------------------------------------------------- */
step('1c', 'Triage the inventory, reading what the others wrote', 'Agent 3 · DeadStock Zero');

console.log(renderHeader(sku));
console.log(renderSignals({
  return_spike_flag: Boolean(sharedState.returnSpikeFlags[SKU]),
  listing_decision: sharedState.listingDecisionLog.filter((e) => e.sku_id === SKU).at(-1) ?? null,
}));
console.log('');

const r1c = await assessSku(SKU, trace);
console.log('');
console.log(renderCard(r1c.decision));
delta(before, snapshot());
before = snapshot();

/* ================================================================== *
 * ROUND 2 — the feedback flows backwards
 * ================================================================== */

round(2, 'Feedback — inventory reality constrains customer service');

const advisory = inventoryAdvisoryFor(SKU);
console.log('');
console.log(`  ${bold('Agent 3 → Agent 2')}   ${dim('advisory now on record')}`);
console.log(`     ${dim(SKU + ':')} replacements ${advisory?.replacements_available ? 'available' : bold('WITHDRAWN')}`);
for (const line of wrap(advisory?.note ?? '', WIDTH - 10)) console.log(`     ${dim(line)}`);

/* --- 2a ----------------------------------------------------------- */
const c2 = complaints.find((row) => row.sku_id === SKU2);

step('2a', 'A second complaint, same category — Agent 2 can now ask Agent 3', 'Agent 2 · Customer Resolution');

if (!c2) {
  console.log(dim(`     No complaint on file for ${SKU2} — skipping.`));
} else {
  console.log(`     ${dim('customer')}  ${c2.customer_name} (${c2.emotional_tone}) · ${SKU2}`);
  for (const line of wrap(c2.complaint_description, WIDTH - 16).slice(0, 2)) {
    console.log(`               ${dim(line)}`);
  }
  console.log('');

  const r2a = await resolve(c2, {
    onAgentCall: (name, args, result) => console.log(renderAgentCall(name, result)),
  });

  console.log('');
  console.log(renderCard({
    risk_level: r2a.escalate_to_human ? 'medium' : 'low',
    intervention: r2a.complaint_pattern_tag,
    reason: r2a.action_taken,
    estimated_recovery: r2a.escalate_to_human ? 'escalated to a human' : 'resolved by the agent',
    weekly_brief_line: '',
  }));
  delta(before, snapshot());
  before = snapshot();
}

/* --- 2b ----------------------------------------------------------- */
step('2b', 'Re-triage the second SKU with the newer signals', 'Agent 3 · DeadStock Zero');

const sku2 = getEnrichedSku(SKU2);
if (sku2) {
  console.log(renderHeader(sku2));
  console.log(renderSignals({
    return_spike_flag: Boolean(sharedState.returnSpikeFlags[SKU2]),
    listing_decision: sharedState.listingDecisionLog.filter((e) => e.sku_id === SKU2).at(-1) ?? null,
  }));
  console.log('');

  const r2b = await assessSku(SKU2, trace);
  console.log('');
  console.log(renderCard(r2b.decision));
  delta(before, snapshot());
  before = snapshot();
}

/* ================================================================== *
 * ROUND 3 — back to where it started
 * ================================================================== */

round(3, 'Full circle — Agent 1 re-reads the same listing');

const patternsNow = complaintPatternsFor(listing.product_category);
console.log('');
console.log(`  ${bold('Agent 2 → Agent 1')}   ${dim('complaint patterns accumulated this run')}`);
for (const p of patternsNow) {
  console.log(`     ${dim('·')} ${p.complaint_pattern_tag}  ${dim('(' + p.sku_id + ')')}`);
}
if (patternsNow.length === 0) console.log(dim('     none'));

step('3a', 'Same listing, same claims — but Agent 1 now has evidence', 'Agent 1 · Fact Checker');

console.log(`     ${dim('round 1 verdict')}  ${r1a.decision} (${r1a.confidence} confidence)`);
console.log('');

const r3a = await checkListing(listing);
console.log(renderCard({
  risk_level: r3a.decision === 'approved' ? 'low' : 'high',
  intervention: r3a.decision,
  reason: r3a.reason,
  estimated_recovery: r3a.recommendation_to_reviewer || 'no reviewer action required',
  weekly_brief_line: '',
}));
delta(before, snapshot());

const moved = r1a.decision !== r3a.decision;
console.log('');
console.log(
  moved
    ? `     ${bold('Agent 1 changed its mind:')} ${r1a.decision} → ${bold(r3a.decision)}, on identical input.`
    : `     ${dim('Agent 1 held at ' + r3a.decision + ' — already at its strictest on round 1.')}`
);

/* ================================================================== *
 * Close
 * ================================================================== */

console.log('');
console.log('');
rule('═');
console.log(`  ${bold('THE LOOP, FOUR CONNECTIONS')}`);
rule('═');

const tick = (ok) => (ok ? '✓' : '·');
const adv = inventoryAdvisoryFor(SKU);

console.log('');
console.log(`  ${tick(patternsNow.length > 0)} Agent 2 → Agent 1   ${patternsNow.length} complaint pattern(s) raised Agent 1's scrutiny`);
console.log(`  ${tick(Boolean(sharedState.returnSpikeFlags[SKU]))} Agent 2 → Agent 3   return spike forced donation over discount`);
console.log(`  ${tick(sharedState.listingDecisionLog.length > 0)} Agent 1 → Agent 3   listing decision used as a demand signal`);
console.log(`  ${tick(Boolean(adv))} Agent 3 → Agent 2   advisory ${adv?.replacements_available === false ? 'withdrew replacement offers' : 'confirmed stock available'}`);

console.log('');
console.log(`  ${bold('final shared state')}`);
console.log(`    listing decisions     ${sharedState.listingDecisionLog.length}`);
console.log(`    complaint patterns    ${sharedState.complaintPatternLog.length}`);
console.log(`    return spikes         ${Object.values(sharedState.returnSpikeFlags).filter(Boolean).length}`);
console.log(`    real actions taken    ${sharedState.actionLedger.length}`);
console.log(`    inventory advisories  ${sharedState.inventoryAdvisoryLog.length}`);
console.log(`    awaiting a human      ${sharedState.reviewQueue.length}`);
console.log('');
