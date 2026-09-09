/**
 * The three connections between the agents. No API key, no network.
 *   npm test
 *
 * These do not test that the agents reason well - that needs a live model and
 * `npm run demo` covers it. They test the wiring: that what one agent writes is
 * exactly what another agent reads, and that the agent-to-agent tool layer
 * reports it faithfully.
 *
 * If someone renames a shared-state field or changes a tag, these fail here
 * rather than silently at the showcase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reset,
  sharedState,
  logComplaintPattern,
  flagReturnSpike,
  logListingDecision,
  recordAction,
  complaintPatternsFor,
  hasReturnSpike,
} from '../src/state.js';
import { readSignals } from '../src/agents/agent3_deadstock.js';
import {
  callAgentTool,
  agentToolsFor,
  CAPABILITIES,
  MAX_AGENT_DEPTH,
  buildListingInput,
  isAgentTool,
} from '../src/agents/registry.js';

const SKU = 'SKU-1001';

/** Exactly what Agent 2 writes when it resolves a misleading-description case. */
function agent2ResolvesComplaint(skuId = SKU) {
  logComplaintPattern({
    complaint_pattern_tag: 'misleading description',
    product_category: 'gadgets',
    sku_id: skuId,
  });
  flagReturnSpike(skuId);
  recordAction({ sku_id: skuId, action: 'issue_refund', amount: 49.99 });
}

/** Exactly what Agent 1 writes when it escalates a listing. */
function agent1EscalatesListing(skuId = SKU) {
  logListingDecision({
    sku_id: skuId,
    product_name: 'UltraCharge Pro 9000',
    product_category: 'gadgets',
    decision: 'escalate',
    confidence: 'high',
    reason: 'Claims are not supported by the specification.',
    complaint_signal: 'misleading-description',
  });
}

/* ------------------------------------------------------------------ *
 * Connection 1 — Agent 2 to Agent 1
 * ------------------------------------------------------------------ */

test('connection 1: a complaint Agent 2 tags is visible to Agent 1', () => {
  reset();
  assert.equal(complaintPatternsFor('gadgets').length, 0, 'starts empty');

  agent2ResolvesComplaint();

  const seen = complaintPatternsFor('gadgets');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].complaint_pattern_tag, 'misleading description');
  assert.equal(seen[0].sku_id, SKU);
  reset();
});

test('connection 1: the signal is scoped to the category, not global', () => {
  reset();
  agent2ResolvesComplaint();
  assert.equal(complaintPatternsFor('gadgets').length, 1);
  assert.equal(complaintPatternsFor('fashion').length, 0, 'must not leak across categories');
  reset();
});

/* ------------------------------------------------------------------ *
 * Connection 2 — Agent 2 to Agent 3
 * ------------------------------------------------------------------ */

test('connection 2: a return spike Agent 2 raises reaches Agent 3', () => {
  reset();
  assert.equal(readSignals(SKU).return_spike_flag, false);

  agent2ResolvesComplaint();

  assert.equal(hasReturnSpike(SKU), true);
  assert.equal(readSignals(SKU).return_spike_flag, true, 'Agent 3 must see it');
  reset();
});

test('connection 2: an unrelated SKU is unaffected', () => {
  reset();
  agent2ResolvesComplaint(SKU);
  assert.equal(readSignals('SKU-1028').return_spike_flag, false);
  reset();
});

/* ------------------------------------------------------------------ *
 * Connection 3 — Agent 1 to Agent 3
 * ------------------------------------------------------------------ */

test('connection 3: a listing decision Agent 1 makes reaches Agent 3', () => {
  reset();
  assert.equal(readSignals(SKU).listing_decision, null);

  agent1EscalatesListing();

  const signal = readSignals(SKU).listing_decision;
  assert.ok(signal, 'Agent 3 must see the decision');
  assert.equal(signal.decision, 'escalate');
  assert.equal(signal.sku_id, SKU);
  reset();
});

test('connection 3: Agent 3 sees the most recent decision when there are several', () => {
  reset();
  agent1EscalatesListing();
  logListingDecision({
    sku_id: SKU,
    product_name: 'UltraCharge Pro 9000',
    product_category: 'gadgets',
    decision: 'auto-blocked',
    confidence: 'high',
    reason: 'Re-reviewed after the complaint pattern was logged.',
    complaint_signal: 'misleading-description',
  });
  assert.equal(readSignals(SKU).listing_decision.decision, 'auto-blocked', 'latest wins');
  reset();
});

/* ------------------------------------------------------------------ *
 * All three at once — the full loop
 * ------------------------------------------------------------------ */

test('the full loop: Agent 3 sees both upstream signals together', () => {
  reset();
  agent1EscalatesListing();
  agent2ResolvesComplaint();

  const signals = readSignals(SKU);
  assert.equal(signals.return_spike_flag, true, 'from Agent 2');
  assert.equal(signals.listing_decision.decision, 'escalate', 'from Agent 1');
  assert.equal(sharedState.actionLedger.length, 1, 'a real action was recorded');
  reset();
});

/* ------------------------------------------------------------------ *
 * The agent-as-tool layer
 * ------------------------------------------------------------------ */

test('the call graph is acyclic: Agent 1 can call nobody', () => {
  assert.deepEqual(CAPABILITIES.agent1, [], 'Agent 1 is a leaf');
  assert.equal(agentToolsFor('agent1').length, 0);
  assert.ok(agentToolsFor('agent2').length > 0, 'Agent 2 can consult Agent 1');
  assert.ok(agentToolsFor('agent3').length > 1, 'Agent 3 can consult both');
});

test('agent tools are distinguishable from data tools', () => {
  assert.equal(isAgentTool('ask_agent1_check_listing'), true);
  assert.equal(isAgentTool('get_product_specs'), false);
});

test('Agent 3 consulting Agent 2 reports what Agent 2 actually did', async () => {
  reset();
  agent2ResolvesComplaint();

  const result = await callAgentTool('ask_agent2_resolution_history', { sku_id: SKU }, {
    stack: ['agent3'],
  });

  assert.equal(result.consulted, 'agent2');
  assert.equal(result.return_spike_flagged, true);
  assert.deepEqual(result.complaint_patterns, ['misleading description']);
  assert.equal(result.resolutions.length, 1);
  assert.match(result.summary, /handled 1 complaint/);
  reset();
});

test('consulting Agent 2 about an untouched SKU says so explicitly', async () => {
  reset();
  const result = await callAgentTool('ask_agent2_resolution_history', { sku_id: 'SKU-1028' }, {
    stack: ['agent3'],
  });
  assert.equal(result.return_spike_flagged, false);
  assert.match(result.summary, /has not handled any complaints/);
  reset();
});

test('the depth limit stops a long agent chain', async () => {
  const stack = Array(MAX_AGENT_DEPTH).fill('agent2');
  const result = await callAgentTool('ask_agent1_check_listing', { sku_id: SKU }, { stack });
  assert.match(result.error, /depth limit/i);
});

test('an agent already on the chain will not be re-entered', async () => {
  const result = await callAgentTool('ask_agent1_check_listing', { sku_id: SKU }, {
    stack: ['agent1'],
  });
  assert.match(result.error, /already on this call chain/i);
});

test('an unknown agent tool fails readably instead of throwing', async () => {
  const result = await callAgentTool('ask_agent9_do_something', {});
  assert.match(result.error, /Unknown agent tool/);
});

test('the listing handed to Agent 1 is built from the real CSVs', () => {
  const listing = buildListingInput(SKU);
  assert.equal(listing.sku_id, SKU);
  assert.ok(listing.claims.length > 0, 'claims present');
  assert.ok(listing.product_description.length > 0, 'description present');
  assert.ok(listing.product_category, 'category joined from products.csv');
  assert.ok(listing.market_region, 'market_region defaulted, not left undefined');
});

test('buildListingInput returns null for an unknown SKU', () => {
  assert.equal(buildListingInput('SKU-9999'), null);
});
