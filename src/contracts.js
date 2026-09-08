/**
 * The contract between the three agents.
 *
 * This file is why three pairs can build three agents at the same time without
 * talking to each other. If your agent returns exactly what is declared here,
 * integration is a five-minute job. If you want to change a field, say so in
 * the team channel first - somebody else is coding against it right now.
 *
 * Owned by whoever owns integration. Pairs: read this, do not edit it.
 */

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const DECISIONS = ['approved', 'escalate', 'auto-blocked'];
export const CONFIDENCE = ['high', 'medium', 'low'];
export const RISK_LEVELS = ['low', 'medium', 'high'];
export const INTERVENTIONS = [
  'reprice',
  'redistribute',
  'bundle',
  'cosmic nexus donation',
  'supplier return',
  'no action',
];

/** Cosmic Mart's three Earth product segments (business case p.6). */
export const CATEGORIES = ['gadgets', 'fashion', 'home and lifestyle'];

/** Agent 2's hard authority ceiling, in USD. Enforced in code, not in the prompt. */
export const REFUND_AUTHORITY_LIMIT = 500;

/* ------------------------------------------------------------------ *
 * Output shapes
 * ------------------------------------------------------------------ */

/** What Agent 1 (Fact Checker) must return. */
export const AGENT1_OUTPUT = {
  decision: DECISIONS,
  confidence: CONFIDENCE,
  reason: 'string',
  recommendation_to_reviewer: 'string',
  complaint_signal: 'string',
};

/** What Agent 2 (Customer Resolution) must return. */
export const AGENT2_OUTPUT = {
  action_taken: 'string',
  response_to_customer: 'string',
  complaint_pattern_tag: 'string',
  escalate_to_human: 'boolean',
};

/** What Agent 3 (DeadStock Zero) must return. */
export const AGENT3_OUTPUT = {
  risk_level: RISK_LEVELS,
  intervention: INTERVENTIONS,
  reason: 'string',
  estimated_recovery: 'string',
  weekly_brief_line: 'string',
};

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export class ContractError extends Error {
  constructor(agent, problems) {
    super(agent + ' returned output that breaks the contract:\n  - ' + problems.join('\n  - '));
    this.name = 'ContractError';
    this.problems = problems;
  }
}

/**
 * Check a parsed agent response against its declared shape.
 * Throws ContractError listing everything that is wrong, rather than failing on
 * the first problem - much faster to debug at 11pm.
 */
export function validate(agent, shape, value) {
  const problems = [];

  if (value === null || typeof value !== 'object') {
    throw new ContractError(agent, ['expected an object, got ' + typeof value]);
  }

  for (const [field, rule] of Object.entries(shape)) {
    const actual = value[field];

    if (Array.isArray(rule)) {
      if (!rule.includes(actual)) {
        problems.push(field + ': expected one of [' + rule.join(', ') + '], got ' + JSON.stringify(actual));
      }
    } else if (rule === 'string') {
      // recommendation_to_reviewer is legitimately empty unless we are escalating.
      const optional = field === 'recommendation_to_reviewer';
      if (typeof actual !== 'string' || (!optional && actual.trim() === '')) {
        problems.push(field + ': expected a non-empty string, got ' + JSON.stringify(actual));
      }
    } else if (rule === 'boolean') {
      if (typeof actual !== 'boolean') {
        problems.push(field + ': expected a boolean, got ' + JSON.stringify(actual));
      }
    }
  }

  if (problems.length) throw new ContractError(agent, problems);
  return value;
}
