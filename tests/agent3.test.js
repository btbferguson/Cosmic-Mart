/**
 * Agent 3 tests. No API key, no network.
 *   npm test
 *
 * These cover the deterministic half of the agent - the CSV parsing, the joins,
 * the data arithmetic and the guardrails. Everything that must be right whether
 * or not the model behaves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCSV,
  parseCSVObjects,
  loadInventory,
  loadListings,
  loadProducts,
  loadComplaints,
  getEnrichedSku,
  getCategoryPeers,
  allSkuIds,
} from '../src/data/loadData.js';
import { applyGuardrails, readSignals } from '../src/agents/agent3_deadstock.js';
import { executeTool, TOOL_DEFS } from '../src/agents/agent3_tools.js';
import { validate, AGENT3_OUTPUT, ContractError, INTERVENTIONS } from '../src/contracts.js';
import { seedSignals } from '../harness/seedSignals.js';
import { reset } from '../src/state.js';

/* ------------------------------------------------------------------ *
 * CSV parser
 * ------------------------------------------------------------------ */

test('parseCSV keeps commas that live inside quoted fields', () => {
  const rows = parseCSV('a,b,c\n1,2,"hello, world"');
  assert.deepEqual(rows[1], ['1', '2', 'hello, world']);
});

test('parseCSV unescapes doubled quotes', () => {
  const rows = parseCSV('a\n"she said ""hi"""');
  assert.deepEqual(rows[1], ['she said "hi"']);
});

test('parseCSV handles CRLF as well as LF', () => {
  assert.deepEqual(parseCSV('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('parseCSV handles a newline inside a quoted field', () => {
  const rows = parseCSV('a,b\n1,"line one\nline two"');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], 'line one\nline two');
});

test('parseCSVObjects maps rows onto the header', () => {
  const rows = parseCSVObjects('sku,note\nSKU-1,"a, b"\n');
  assert.deepEqual(rows, [{ sku: 'SKU-1', note: 'a, b' }]);
});

/* ------------------------------------------------------------------ *
 * The real data
 * ------------------------------------------------------------------ */

test('all four CSVs load with the expected row counts', () => {
  assert.equal(loadInventory().length, 50);
  assert.equal(loadListings().length, 50);
  assert.equal(loadProducts().length, 50);
  assert.equal(loadComplaints().length, 20);
});

test('sku_id joins cleanly across inventory, listings and products', () => {
  const inventory = new Set(allSkuIds());
  assert.equal(inventory.size, 50, 'no duplicate sku_ids');
  for (const file of [loadListings(), loadProducts()]) {
    for (const row of file) {
      assert.ok(inventory.has(row.sku_id), row.sku_id + ' missing from inventory');
    }
  }
});

test('every complaint points at a SKU that exists', () => {
  const inventory = new Set(allSkuIds());
  for (const row of loadComplaints()) {
    assert.ok(inventory.has(row.sku_id), 'complaint references unknown ' + row.sku_id);
  }
});

test('days_of_supply agrees with stock and velocity to within a day', () => {
  for (const row of loadInventory()) {
    const computed = (row.current_stock / row.sales_velocity_weekly) * 7;
    assert.ok(
      Math.abs(computed - row.days_of_supply) <= 1,
      row.sku_id + ': stated ' + row.days_of_supply + 'd, computed ' + computed.toFixed(1) + 'd'
    );
  }
});

test('the risk spread still discriminates - not everything is high risk', () => {
  const rows = loadInventory();
  const high = rows.filter((r) => r.days_of_supply > 60).length;
  const low = rows.filter((r) => r.days_of_supply < 30).length;
  assert.ok(high > 0 && high < 15, 'expected a handful of high-risk SKUs, got ' + high);
  assert.ok(low > 10, 'expected plenty of healthy SKUs, got ' + low);
});

test('getEnrichedSku joins specs, listing and complaints onto the row', () => {
  const sku = getEnrichedSku('SKU-1001');
  assert.equal(sku.sku_id, 'SKU-1001');
  assert.ok(sku.specs, 'specs joined');
  assert.ok(sku.listing_claims, 'listing claims joined');
  assert.ok(Array.isArray(sku.complaints));
  assert.ok(sku.notes.includes('return rate'), 'quoted notes survived parsing');
});

test('getEnrichedSku returns null for an unknown SKU rather than throwing', () => {
  assert.equal(getEnrichedSku('SKU-9999'), null);
});

test('getCategoryPeers summarises a category', () => {
  const peers = getCategoryPeers('gadgets');
  assert.equal(peers.product_category, 'gadgets');
  assert.ok(peers.sku_count > 0);
  assert.equal(typeof peers.median_days_of_supply, 'number');
});

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

test('every tool definition is well formed', () => {
  for (const def of TOOL_DEFS) {
    assert.equal(def.type, 'function');
    assert.ok(def.function.name && def.function.description);
    assert.equal(def.function.parameters.type, 'object');
  }
});

test('tools return real data, and say so when there is none', () => {
  assert.ok(executeTool('get_product_specs', { sku_id: 'SKU-1001' }).specs.length > 0);
  assert.ok(executeTool('get_listing', { sku_id: 'SKU-1001' }).listing_claims.length > 0);
  const none = executeTool('get_complaints', { sku_id: 'SKU-1007' });
  assert.equal(none.complaint_count, 0);
  assert.deepEqual(none.complaints, []);
});

test('an unknown tool name comes back as an error the model can read', () => {
  assert.match(executeTool('does_not_exist', {}).error, /Unknown tool/);
});

/* ------------------------------------------------------------------ *
 * Guardrails
 * ------------------------------------------------------------------ */

const decision = (intervention) => ({
  risk_level: 'medium',
  intervention,
  reason: 'a reason',
  estimated_recovery: '$1,000 recovered',
  weekly_brief_line: 'a line',
});

test('a return spike forces cosmic nexus donation over the model choice', () => {
  const out = applyGuardrails(decision('reprice'), { return_spike_flag: true });
  assert.equal(out.intervention, 'cosmic nexus donation');
  assert.equal(out.risk_level, 'high');
  assert.equal(out.guardrail.model_chose, 'reprice');
});

test('the guardrail leaves a correct answer alone', () => {
  const out = applyGuardrails(decision('cosmic nexus donation'), { return_spike_flag: true });
  assert.equal(out.intervention, 'cosmic nexus donation');
  assert.equal(out.guardrail, undefined);
});

test('no return spike means no override', () => {
  const out = applyGuardrails(decision('reprice'), { return_spike_flag: false });
  assert.equal(out.intervention, 'reprice');
  assert.equal(out.guardrail, undefined);
});

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

test('a well formed decision passes the contract', () => {
  assert.doesNotThrow(() => validate('agent3', AGENT3_OUTPUT, decision('reprice')));
});

test('write-off is not a legal intervention', () => {
  assert.ok(!INTERVENTIONS.includes('write-off'));
  assert.throws(() => validate('agent3', AGENT3_OUTPUT, decision('write-off')), ContractError);
});

/* ------------------------------------------------------------------ *
 * Shared-state signals
 * ------------------------------------------------------------------ */

test('seeding produces the intended return-spike cohort', () => {
  const { spikes } = seedSignals();
  const expected = loadInventory().filter((r) => r.return_rate_pct > 10).length;
  assert.equal(spikes, expected);
  assert.ok(spikes > 0 && spikes < 15, 'a cohort, not everything');
  reset();
});

test('Agent 3 reads the signals Agents 1 and 2 would have written', () => {
  seedSignals();
  const spiking = readSignals('SKU-1001');
  assert.equal(spiking.return_spike_flag, true);
  assert.ok(spiking.listing_decision, 'listing decision visible');

  const healthy = readSignals('SKU-1007');
  assert.equal(healthy.return_spike_flag, false);
  reset();
});
