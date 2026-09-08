/**
 * Environment smoke tests. No API key needed, no network calls.
 *   npm test
 *
 * These exist so a teammate can prove their checkout is sane before writing a
 * line of their own code. If these pass, the plumbing is fine and any problem
 * is in your agent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJSON } from '../src/llm.js';
import { validate, ContractError, AGENT1_OUTPUT } from '../src/contracts.js';
import * as state from '../src/state.js';

test('extractJSON reads a plain JSON object', () => {
  assert.deepEqual(extractJSON('{"decision":"approved"}'), { decision: 'approved' });
});

test('extractJSON survives markdown fences', () => {
  const fenced = '```json\n{"decision":"escalate"}\n```';
  assert.deepEqual(extractJSON(fenced), { decision: 'escalate' });
});

test('extractJSON survives a chatty preamble', () => {
  const chatty = 'Here is my assessment:\n\n{"decision":"auto-blocked"}\n\nHope that helps.';
  assert.deepEqual(extractJSON(chatty), { decision: 'auto-blocked' });
});

test('extractJSON throws something readable on junk', () => {
  assert.throws(() => extractJSON('not json at all'), /Could not parse JSON/);
});

test('validate accepts output matching the contract', () => {
  const good = {
    decision: 'approved',
    confidence: 'high',
    reason: 'Every claim restates a verifiable product detail.',
    recommendation_to_reviewer: '',
    complaint_signal: 'none',
  };
  assert.equal(validate('agent1', AGENT1_OUTPUT, good), good);
});

test('validate reports every problem at once, not just the first', () => {
  const bad = {
    decision: 'maybe',
    confidence: 'very high',
    reason: '',
    recommendation_to_reviewer: '',
    complaint_signal: 'x',
  };
  let error;
  try {
    validate('agent1', AGENT1_OUTPUT, bad);
  } catch (thrown) {
    error = thrown;
  }
  assert.ok(error instanceof ContractError, 'expected a ContractError to be thrown');
  assert.equal(error.problems.length, 3); // decision, confidence, reason
});

test('shared state writes are visible to readers', () => {
  state.reset();
  state.logComplaintPattern({
    complaint_pattern_tag: 'test-tag',
    product_category: 'gadgets',
    sku_id: 'SKU-TEST',
  });
  assert.equal(state.complaintPatternsFor('gadgets').length, 1);
  assert.equal(state.complaintPatternsFor('fashion').length, 0);
  state.reset();
});

test('return spike flags round-trip', () => {
  state.reset();
  assert.equal(state.hasReturnSpike('SKU-TEST'), false);
  state.flagReturnSpike('SKU-TEST');
  assert.equal(state.hasReturnSpike('SKU-TEST'), true);
  state.reset();
});

test('subscribers are notified on write', () => {
  state.reset();
  const seen = [];
  const unsubscribe = state.subscribe((event) => seen.push(event.type));
  state.flagReturnSpike('SKU-TEST');
  unsubscribe();
  state.flagReturnSpike('SKU-OTHER');
  assert.deepEqual(seen, ['returnSpike']); // only while subscribed
  state.reset();
});
