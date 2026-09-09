/**
 * Agent 1 — Fact Checker
 *
 * Assesses a product listing's promotional claims for accuracy, compliance,
 * and honesty before the listing goes live. Returns one of three decisions:
 * approved, escalate, or auto-blocked.
 *
 * Safety rule enforced in code, not only in the prompt:
 * WHEN UNCERTAIN, ESCALATE. NEVER APPROVE.
 */

import { callJSON } from '../llm.js';
import { validate, AGENT1_OUTPUT } from '../contracts.js';
import { complaintPatternsFor, logListingDecision, enqueueForReview } from '../state.js';
import { buildPrompt } from '../prompts/prompt_agent1.js';

const VALID_CATEGORIES = ['gadgets', 'fashion', 'home and lifestyle'];

function validateInput(listing) {
  const required = ['product_name', 'product_description', 'claims', 'market_region', 'product_category', 'sku_id'];
  for (const field of required) {
    if (typeof listing[field] !== 'string' || listing[field].trim() === '') {
      throw new Error(`Agent 1: missing or empty input field "${field}"`);
    }
  }
  if (!VALID_CATEGORIES.includes(listing.product_category)) {
    throw new Error(`Agent 1: unknown product_category "${listing.product_category}"`);
  }
}

/**
 * Enforce "when uncertain, escalate — never approve" in executable code.
 *
 * The model could return approved with non-high confidence. This function
 * catches that and overrides it so the safety rule is not merely advisory.
 * It also enforces the contract rule that recommendation_to_reviewer is
 * non-empty on escalate and empty on all other decisions.
 */
function applySafetyRules(result) {
  // Approved with anything less than high confidence is unsafe — escalate.
  if (result.decision === 'approved' && result.confidence !== 'high') {
    result.decision = 'escalate';
    result.recommendation_to_reviewer =
      result.recommendation_to_reviewer?.trim() ||
      'Agent escalated from approved because confidence was not high. Verify every promotional claim against the factual product description before approving.';
  }

  // Escalation must always carry a specific reviewer instruction.
  if (result.decision === 'escalate' && !result.recommendation_to_reviewer?.trim()) {
    result.recommendation_to_reviewer =
      'Review all promotional claims against the factual product description and verify each claim is accurately supported.';
  }

  // Approved and auto-blocked decisions must have an empty reviewer recommendation.
  if (result.decision !== 'escalate') {
    result.recommendation_to_reviewer = '';
  }

  return result;
}

/**
 * Assess one product listing and return a contract-validated Agent 1 output.
 *
 * Reads complaint patterns from shared state (never from the caller).
 * Writes logListingDecision on every call and enqueueForReview on non-approved.
 *
 * @param {object} listing
 * @param {string} listing.product_name
 * @param {string} listing.product_description
 * @param {string} listing.claims
 * @param {string} listing.market_region
 * @param {string} listing.product_category  - 'gadgets' | 'fashion' | 'home and lifestyle'
 * @param {string} listing.sku_id
 * @returns {Promise<object>} Contract-validated Agent 1 output
 */
export async function checkListing(listing) {
  validateInput(listing);

  // Complaint patterns come from shared state, not from the caller.
  // This is how Agent 2 makes Agent 1 stricter where trust already broke.
  const patterns = complaintPatternsFor(listing.product_category);

  const { system, messages } = buildPrompt(listing, patterns);

  const raw = await callJSON({ agent: 'agent1', system, messages });

  // Safety rules enforced in code before contract validation.
  const result = applySafetyRules(raw);

  // Throws ContractError listing every problem if anything is wrong.
  validate('agent1', AGENT1_OUTPUT, result);

  // Audit trail — every assessment is logged, regardless of decision.
  // Agent 3 reads this to distinguish real weak demand from a pulled listing.
  logListingDecision({
    sku_id: listing.sku_id,
    product_name: listing.product_name,
    product_category: listing.product_category,
    market_region: listing.market_region,
    decision: result.decision,
    confidence: result.confidence,
    reason: result.reason,
    complaint_signal: result.complaint_signal,
  });

  // Human reviewer inbox — every non-approved listing goes here.
  if (result.decision !== 'approved') {
    enqueueForReview({
      sku_id: listing.sku_id,
      product_name: listing.product_name,
      product_category: listing.product_category,
      decision: result.decision,
      confidence: result.confidence,
      reason: result.reason,
      recommendation_to_reviewer: result.recommendation_to_reviewer,
      complaint_signal: result.complaint_signal,
    });
  }

  return result;
}
