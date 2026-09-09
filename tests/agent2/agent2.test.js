import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { sharedState, reset } from '../../src/state.js';
import { validate, ContractError, AGENT2_OUTPUT } from '../../src/contracts.js';
import { TOOL_DEFS, toolHandlers } from '../../src/tools/index.js';
import { loadComplaints } from '../../src/agents/agent2_resolution.js';

// ── Tool unit tests ───────────────────────────────────────────────────────────
// No LLM calls. Must pass with no ANTHROPIC_API_KEY set.

describe('issue_refund', () => {
  beforeEach(() => reset());

  it('refuses amounts above $500 without recording an action', async () => {
    const result = await toolHandlers.issue_refund({
      complaint_id: 'CMP-TEST', order_id: 'CM-9999', sku_id: 'SKU-TEST',
      amount: 750, reason: 'test over-limit',
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /exceeds.*authority/i);
    // recordAction must NOT have fired for a refused refund
    assert.equal(sharedState.actionLedger.length, 0);
  });

  it('accepts a refund of exactly $500', async () => {
    const result = await toolHandlers.issue_refund({
      complaint_id: 'CMP-TEST', order_id: 'CM-9999', sku_id: 'SKU-TEST',
      amount: 500, reason: 'at the limit',
    });
    assert.equal(result.success, true);
    assert.equal(sharedState.actionLedger.length, 1);
    assert.equal(sharedState.actionLedger[0].type, 'refund');
    assert.equal(sharedState.actionLedger[0].amount, 500);
  });

  it('accepts a refund below $500', async () => {
    const result = await toolHandlers.issue_refund({
      complaint_id: 'CMP-TEST', order_id: 'CM-9999', sku_id: 'SKU-TEST',
      amount: 299, reason: 'normal refund',
    });
    assert.equal(result.success, true);
    assert.equal(sharedState.actionLedger.length, 1);
  });
});

describe('dispatch_replacement', () => {
  beforeEach(() => reset());

  it('records an action in the ledger', async () => {
    const result = await toolHandlers.dispatch_replacement({
      complaint_id: 'CMP-TEST', order_id: 'CM-9999', sku_id: 'SKU-TEST',
      product_name: 'Test Product', reason: 'defective unit',
    });
    assert.equal(result.success, true);
    assert.equal(sharedState.actionLedger.length, 1);
    assert.equal(sharedState.actionLedger[0].type, 'replacement');
    assert.equal(sharedState.actionLedger[0].sku_id, 'SKU-TEST');
  });
});

describe('waive_fee', () => {
  beforeEach(() => reset());

  it('records an action with fee_type in the ledger', async () => {
    const result = await toolHandlers.waive_fee({
      complaint_id: 'CMP-TEST', order_id: 'CM-9999',
      fee_type: 'shipping', amount: 9.99, reason: 'goodwill gesture',
    });
    assert.equal(result.success, true);
    assert.equal(sharedState.actionLedger.length, 1);
    assert.equal(sharedState.actionLedger[0].type, 'fee_waiver');
    assert.equal(sharedState.actionLedger[0].fee_type, 'shipping');
  });
});

// ── TOOL_DEFS shape ───────────────────────────────────────────────────────────

describe('TOOL_DEFS', () => {
  it('exports an array with all three tools', () => {
    assert.ok(Array.isArray(TOOL_DEFS));
    assert.equal(TOOL_DEFS.length, 3);
    const names = TOOL_DEFS.map(t => t.name);
    assert.ok(names.includes('issue_refund'));
    assert.ok(names.includes('dispatch_replacement'));
    assert.ok(names.includes('waive_fee'));
  });

  it('uses input_schema (Anthropic format, not OpenAI parameters)', () => {
    for (const def of TOOL_DEFS) {
      assert.ok(def.input_schema, `${def.name} missing input_schema`);
      assert.equal(def.input_schema.type, 'object');
    }
  });
});

// ── Contract validation ───────────────────────────────────────────────────────

describe('validate agent2 output', () => {
  const valid = {
    action_taken: 'Refund of $299 issued.',
    response_to_customer: 'Your refund has been processed.',
    complaint_pattern_tag: 'misleading description',
    escalate_to_human: false,
  };

  it('accepts a well-formed result', () => {
    assert.doesNotThrow(() => validate('agent2', AGENT2_OUTPUT, valid));
  });

  it('rejects missing escalate_to_human', () => {
    const bad = { ...valid };
    delete bad.escalate_to_human;
    assert.throws(() => validate('agent2', AGENT2_OUTPUT, bad), ContractError);
  });

  it('rejects escalate_to_human as a string', () => {
    const bad = { ...valid, escalate_to_human: 'false' };
    assert.throws(
      () => validate('agent2', AGENT2_OUTPUT, bad),
      (err) => err instanceof ContractError && err.problems.some(p => p.includes('escalate_to_human')),
    );
  });

  it('rejects empty action_taken', () => {
    const bad = { ...valid, action_taken: '' };
    assert.throws(() => validate('agent2', AGENT2_OUTPUT, bad), ContractError);
  });

  it('rejects empty response_to_customer', () => {
    const bad = { ...valid, response_to_customer: '   ' };
    assert.throws(() => validate('agent2', AGENT2_OUTPUT, bad), ContractError);
  });
});

// ── CSV loading ───────────────────────────────────────────────────────────────

describe('loadComplaints', () => {
  let complaints;
  before(() => { complaints = loadComplaints(); });

  it('returns an array with entries', () => {
    assert.ok(Array.isArray(complaints));
    assert.ok(complaints.length > 0);
  });

  it('CMP-001 has expected fields', () => {
    const cmp001 = complaints.find(c => c.complaint_id === 'CMP-001');
    assert.ok(cmp001, 'CMP-001 not found');
    assert.equal(cmp001.sku_id, 'SKU-1001');
    assert.equal(cmp001.emotional_tone, 'angry');
    assert.ok(cmp001.complaint_description.length > 0);
  });

  it('CMP-017 exists and has a calm tone', () => {
    const cmp017 = complaints.find(c => c.complaint_id === 'CMP-017');
    assert.ok(cmp017, 'CMP-017 not found');
    assert.equal(cmp017.emotional_tone, 'calm');
  });
});
