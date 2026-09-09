/**
 * DeadStock Zero - terminal harness.
 *
 *   npm run agent3 -- --sku SKU-1001    triage one SKU, full trace
 *   npm run agent3 -- --all             triage every SKU
 *   npm run agent3 -- --brief           weekly leadership roll-up
 *   npm run agent3 -- --list            list SKUs, no model calls
 */

import { assessSku, readSignals } from '../src/agents/agent3_deadstock.js';
import { loadInventory, getEnrichedSku } from '../src/data/loadData.js';
import { OR_MODEL, OR_MODE } from '../src/openrouter.js';
import { seedSignals } from './seedSignals.js';
import {
  renderHeader,
  renderSignals,
  renderThinking,
  renderToolCall,
  renderCard,
  renderRow,
  wrap,
  dim,
  bold,
  WIDTH,
} from './render.js';

/* ------------------------------------------------------------------ *
 * Args
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};

if (has('--help') || argv.length === 0) {
  console.log(`
${bold('DeadStock Zero')} — Cosmic Mart inventory recovery agent

  npm run agent3 -- --sku SKU-1001              one SKU, full trace
  npm run agent3 -- --sku SKU-1001,SKU-1028     several SKUs, full trace each
  npm run agent3 -- --all                       triage every SKU, one line each
  npm run agent3 -- --all --verbose             every SKU WITH the full trace
  npm run agent3 -- --brief                     weekly leadership roll-up
  npm run agent3 -- --list                      list SKUs (no model calls, no key)

  --limit N                                     with --all or --brief, cap the count
  --verbose                                     show reasoning and tool calls in batch runs
`);
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * --list (no model, no key)
 * ------------------------------------------------------------------ */

if (has('--list')) {
  seedSignals();
  console.log(`\n  ${bold('SKU').padEnd(18)}${bold('product').padEnd(40)}${bold('supply')}  ${bold('returns')}  signals`);
  for (const row of loadInventory()) {
    const signals = readSignals(row.sku_id);
    const chips = [
      signals.return_spike_flag ? 'return-spike' : '',
      signals.listing_decision ? `listing:${signals.listing_decision.decision}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(
      `  ${row.sku_id.padEnd(18)}${row.product_name.slice(0, 38).padEnd(40)}` +
        `${String(row.days_of_supply).padStart(4)}d  ` +
        `${String(row.return_rate_pct).padStart(6)}%  ${dim(chips)}`
    );
  }
  console.log('');
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * Setup for anything that calls the model
 * ------------------------------------------------------------------ */

console.log(dim(`\n  model ${OR_MODEL}   mode ${OR_MODE}`));
const seeded = seedSignals();
console.log(
  dim(`  seeded ${seeded.spikes} return spikes, ${seeded.decisions} listing decisions (standing in for Agents 2 and 1)`)
);

const limit = Number(valueOf('--limit')) || Infinity;

/** Triage one SKU, printing the full trace as it happens. */
async function runOne(skuId) {
  const sku = getEnrichedSku(skuId);
  if (!sku) {
    console.error(`\n  Unknown SKU: ${skuId}. Try --list to see what exists.\n`);
    process.exit(1);
  }

  console.log(renderHeader(sku));
  console.log(renderSignals(readSignals(skuId)));
  console.log('');

  const result = await assessSku(skuId, {
    onEvent(event) {
      if (event.type === 'thinking') {
        const text = renderThinking(event.text);
        if (text) console.log(text);
      } else if (event.type === 'tool') {
        console.log(renderToolCall(event.name, event.result));
      }
    },
  });

  console.log('');
  console.log(renderCard(result.decision));
  console.log(
    dim(
      `  ${result.trace.turns} turns · ${result.trace.toolCalls.length} tool calls · ` +
        `${result.trace.usage.in + result.trace.usage.out} tokens · $${result.trace.usage.cost.toFixed(5)}`
    )
  );
  console.log('');
  return result;
}

/**
 * Triage many. One compact line each by default; with verbose, the same full
 * trace --sku gives you, per SKU.
 */
async function runMany(skuIds, { verbose = false } = {}) {
  const results = [];
  let cost = 0;

  console.log('');
  for (const skuId of skuIds) {
    try {
      const result = verbose ? await runOne(skuId) : await assessSku(skuId);
      results.push(result);
      cost += result.trace.usage.cost;
      if (!verbose) console.log(renderRow(result.sku, result.decision));
    } catch (error) {
      console.log(`  ${skuId.padEnd(9)}${dim('failed: ' + error.message.slice(0, 60))}`);
    }
  }

  const byRisk = { high: 0, medium: 0, low: 0 };
  const byIntervention = {};
  let overrides = 0;
  for (const { decision } of results) {
    byRisk[decision.risk_level]++;
    byIntervention[decision.intervention] = (byIntervention[decision.intervention] ?? 0) + 1;
    if (decision.guardrail) overrides++;
  }

  console.log(`\n  ${dim('─'.repeat(WIDTH))}`);
  console.log(`  ${bold('risk')}         high ${byRisk.high}   medium ${byRisk.medium}   low ${byRisk.low}`);
  console.log(
    `  ${bold('interventions')} ` +
      Object.entries(byIntervention)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} ${count}`)
        .join('   ')
  );
  if (overrides) console.log(`  ${bold('guardrail')}    ${overrides} model choices overridden`);
  console.log(dim(`  ${results.length} SKUs · $${cost.toFixed(4)}`));
  console.log('');
  return results;
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

try {
  const verbose = has('--verbose');

  if (has('--sku')) {
    const ids = (valueOf('--sku') ?? '')
      .split(',')
      .map((id) => id.trim().toUpperCase())
      .filter(Boolean);

    if (ids.length === 0) {
      throw new Error('--sku needs at least one SKU id, e.g. --sku SKU-1001,SKU-1028');
    }

    // One SKU prints just the trace. Several also print the roll-up at the end,
    // so you can see the spread without scrolling back up.
    if (ids.length === 1) await runOne(ids[0]);
    else await runMany(ids, { verbose: true });
  } else if (has('--all') || has('--brief')) {
    const ids = loadInventory().map((row) => row.sku_id).slice(0, limit);
    const results = await runMany(ids, { verbose });

    if (has('--brief')) {
      console.log(`  ${bold('WEEKLY DEAD STOCK BRIEF')}`);
      console.log(`  ${dim('─'.repeat(WIDTH))}`);
      const actionable = results
        .filter((r) => r.decision.intervention !== 'no action')
        .sort((a, b) => b.sku.days_of_supply - a.sku.days_of_supply);

      for (const { decision } of actionable) {
        for (const [i, line] of wrap(decision.weekly_brief_line, WIDTH - 6).entries()) {
          console.log(`  ${i === 0 ? '•' : ' '} ${line}`);
        }
      }
      console.log(
        dim(`\n  ${actionable.length} of ${results.length} SKUs need action this week.\n`)
      );
    }
  } else {
    console.error('\n  Nothing to do. Try --help.\n');
    process.exit(1);
  }
} catch (error) {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
}
