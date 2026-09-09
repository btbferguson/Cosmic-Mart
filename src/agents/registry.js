/**
 * The agent registry — this is what lets the three agents call each other.
 *
 * Each agent is wrapped as a callable tool. An agent that is handed these tool
 * definitions can decide, mid-reasoning, to consult another agent rather than
 * guess. Agent 3 seeing an 18% return rate can ask Agent 1 "is this listing
 * actually lying?" instead of inferring it from a notes field.
 *
 * The call graph:
 *
 *     Agent 3  ──►  Agent 1        "is this SKU's listing accurate?"
 *     Agent 3  ──►  Agent 2        "how were complaints on this SKU resolved?"
 *     Agent 2  ──►  Agent 1        "is the claim this customer is angry about real?"
 *     Agent 2  ──►  Agent 3        "can I still promise this customer a replacement?"
 *     Agent 1  ──►  (nothing)      leaf; it already reads the complaint log
 *
 * Agent 2 and Agent 3 can each consult the other, so the graph is NOT acyclic.
 * It terminates anyway, by construction:
 *
 *   - Agent 3 -> Agent 2 and Agent 2 -> Agent 3 both read published state. They
 *     do not re-invoke the other agent's model, so a consultation cannot spawn
 *     another consultation.
 *   - The call stack below refuses to re-enter an agent already on the chain.
 *   - MAX_AGENT_DEPTH caps the chain regardless.
 *
 * Multi-round conversation between agents is driven by the orchestrator in
 * harness/demo.js, which runs a fixed number of rounds. Rounds are bounded by
 * a loop counter; recursion is not. That distinction is the whole safety story.
 *
 * Two things worth knowing:
 *
 * 1. Agent 2 has real spend authority — it issues refunds. Invoking it is a
 *    side-effecting action, so it is exposed to Agent 3 as READ-ONLY history
 *    rather than as "go resolve this". An inventory agent should not be able to
 *    trigger refunds.
 *
 * 2. Agents 1 and 2 run on Anthropic; Agent 3 runs on OpenRouter. If a
 *    provider's key is missing, the tool returns a readable { error } instead of
 *    throwing, so the calling agent degrades rather than dying.
 */

import {
  loadListings,
  loadProducts,
  loadComplaints,
  getInventoryRow as loadInventoryRow,
} from '../data/loadData.js';
import { sharedState, inventoryAdvisoryFor } from '../state.js';

/** How many agents deep a single chain may go before we stop it. */
export const MAX_AGENT_DEPTH = 2;

/** Default when the data has no market_region column. */
const DEFAULT_MARKET = 'North America';

/* ------------------------------------------------------------------ *
 * Provider availability
 * ------------------------------------------------------------------ */

const hasAnthropicKey = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key) && !key.includes('paste-your-own');
};

const unavailable = (agent, envVar) => ({
  error:
    `${agent} is unavailable: ${envVar} is not set. ` +
    `Proceed using the information you already have, and say in your reason ` +
    `that you could not consult ${agent}.`,
});

/* ------------------------------------------------------------------ *
 * Building an Agent 1 input from the CSVs
 * ------------------------------------------------------------------ */

/**
 * Assemble the listing object Agent 1 expects for a SKU.
 * Returns null when the SKU has no listing on file.
 */
export function buildListingInput(skuId) {
  const listing = loadListings().find((row) => row.sku_id === skuId);
  if (!listing) return null;

  const product = loadProducts().find((row) => row.sku_id === skuId);

  return {
    sku_id: skuId,
    product_name: listing.product_name,
    product_description: listing.listing_description,
    claims: listing.listing_claims,
    product_category: product?.product_category ?? 'gadgets',
    // Not present in the data. Stated explicitly rather than silently defaulted.
    market_region: DEFAULT_MARKET,
  };
}

/* ------------------------------------------------------------------ *
 * Tool definitions
 * ------------------------------------------------------------------ */

const CHECK_LISTING_TOOL = {
  type: 'function',
  function: {
    name: 'ask_agent1_check_listing',
    description:
      'Consult Agent 1, the pre-publication compliance checker, about a SKU. ' +
      'Agent 1 compares the customer-facing claims against the manufacturer ' +
      'specification and returns approved, escalate or auto-blocked with its ' +
      'reasoning. Use this when you need to know whether a listing is actually ' +
      'misleading rather than assuming it from a return rate.',
    parameters: {
      type: 'object',
      properties: {
        sku_id: { type: 'string', description: 'e.g. SKU-1001' },
      },
      required: ['sku_id'],
      additionalProperties: false,
    },
  },
};

const RESOLUTION_HISTORY_TOOL = {
  type: 'function',
  function: {
    name: 'ask_agent2_resolution_history',
    description:
      'Ask Agent 2, the customer resolution agent, what it has already done ' +
      'about a SKU: the complaint patterns it tagged, whether it flagged a ' +
      'return spike, and any refunds or replacements it issued. Read-only — ' +
      'this reports past resolutions, it does not create new ones.',
    parameters: {
      type: 'object',
      properties: {
        sku_id: { type: 'string', description: 'e.g. SKU-1001' },
      },
      required: ['sku_id'],
      additionalProperties: false,
    },
  },
};

const INVENTORY_OUTLOOK_TOOL = {
  type: 'function',
  function: {
    name: 'ask_agent3_inventory_outlook',
    description:
      'Ask Agent 3, the inventory recovery agent, what is happening to this ' +
      'SKU stock. Tells you the risk level, the recovery intervention in ' +
      'progress, and crucially whether replacement units are still available. ' +
      'Call this BEFORE offering a customer a replacement - stock routed to ' +
      'donation or back to the supplier cannot be promised to anyone.',
    parameters: {
      type: 'object',
      properties: {
        sku_id: { type: 'string', description: 'e.g. SKU-1001' },
      },
      required: ['sku_id'],
      additionalProperties: false,
    },
  },
};

/**
 * Which agents each caller is allowed to consult.
 * Keeping this as data rather than scattered conditionals makes the call graph
 * something you can read in one place.
 */
export const CAPABILITIES = {
  agent1: [],
  agent2: ['ask_agent1_check_listing', 'ask_agent3_inventory_outlook'],
  agent3: ['ask_agent1_check_listing', 'ask_agent2_resolution_history'],
};

const TOOLS_BY_NAME = {
  ask_agent1_check_listing: CHECK_LISTING_TOOL,
  ask_agent2_resolution_history: RESOLUTION_HISTORY_TOOL,
  ask_agent3_inventory_outlook: INVENTORY_OUTLOOK_TOOL,
};

/** The agent-to-agent tool definitions a given caller may use. */
export function agentToolsFor(caller) {
  return (CAPABILITIES[caller] ?? []).map((name) => TOOLS_BY_NAME[name]);
}

export const isAgentTool = (name) => name in TOOLS_BY_NAME;

/**
 * The same tools in Anthropic's shape.
 *
 * Agents 1 and 2 run on the Anthropic SDK, which wants { name, description,
 * input_schema }. Agent 3 runs on OpenRouter, which wants OpenAI's
 * { type, function: { name, description, parameters } }. One definition,
 * converted here, so the two never drift apart.
 */
export function agentToolsForAnthropic(caller) {
  return agentToolsFor(caller).map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

async function askAgent1CheckListing({ sku_id }) {
  if (!hasAnthropicKey()) return unavailable('Agent 1', 'ANTHROPIC_API_KEY');

  const listing = buildListingInput(sku_id);
  if (!listing) return { error: `No listing on file for ${sku_id}` };

  // Imported lazily so a missing Anthropic setup cannot break module load for
  // agents that never call it.
  const { checkListing } = await import('./agent1_factchecker.js');
  const result = await checkListing(listing);

  return {
    sku_id,
    consulted: 'agent1',
    decision: result.decision,
    confidence: result.confidence,
    reason: result.reason,
    complaint_signal: result.complaint_signal,
  };
}

function askAgent2ResolutionHistory({ sku_id }) {
  const patterns = sharedState.complaintPatternLog.filter((e) => e.sku_id === sku_id);
  const actions = sharedState.actionLedger.filter((e) => e.sku_id === sku_id);

  return {
    sku_id,
    consulted: 'agent2',
    return_spike_flagged: Boolean(sharedState.returnSpikeFlags[sku_id]),
    complaint_patterns: patterns.map((e) => e.complaint_pattern_tag),
    resolutions: actions.map((e) => ({ action: e.action ?? e.type, amount: e.amount })),
    // Say "none" out loud so the model does not read silence as a failed lookup.
    summary:
      patterns.length === 0 && actions.length === 0
        ? 'Agent 2 has not handled any complaints for this SKU.'
        : `Agent 2 has handled ${patterns.length} complaint(s) for this SKU.`,
  };
}

/**
 * Report Agent 3's inventory position on a SKU.
 *
 * Deliberately reads the advisory Agent 3 already published rather than
 * invoking Agent 3 fresh. Agent 2 is often mid-conversation with a customer;
 * a full inventory triage is slow, and the advisory is the durable answer.
 * When Agent 3 has not looked at the SKU yet we say so plainly and fall back
 * to the raw stock position, which is still enough to decide on a replacement.
 */
function askAgent3InventoryOutlook({ sku_id }) {
  const advisory = inventoryAdvisoryFor(sku_id);

  if (advisory) {
    return {
      sku_id,
      consulted: 'agent3',
      assessed: true,
      risk_level: advisory.risk_level,
      intervention: advisory.intervention,
      replacements_available: advisory.replacements_available,
      guidance: advisory.note,
    };
  }

  const row = loadInventoryRow(sku_id);
  if (!row) return { error: `No inventory record for ${sku_id}` };

  return {
    sku_id,
    consulted: 'agent3',
    assessed: false,
    current_stock: row.current_stock,
    days_of_supply: row.days_of_supply,
    replacements_available: row.current_stock > 0,
    guidance:
      'Agent 3 has not triaged this SKU yet. Stock is physically on hand, so a ' +
      'replacement is possible, but no recovery decision has been made.',
  };
}

const HANDLERS = {
  ask_agent1_check_listing: askAgent1CheckListing,
  ask_agent2_resolution_history: askAgent2ResolutionHistory,
  ask_agent3_inventory_outlook: askAgent3InventoryOutlook,
};

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

/**
 * Run one agent-to-agent tool call.
 *
 * @param {string} name    tool name
 * @param {object} args    tool arguments
 * @param {object} [ctx]
 * @param {string[]} [ctx.stack]  agents already on this call chain
 * @returns {Promise<object>} JSON-serialisable result, or { error }
 */
export async function callAgentTool(name, args, { stack = [] } = {}) {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown agent tool: ${name}` };

  if (stack.length >= MAX_AGENT_DEPTH) {
    return {
      error:
        `Agent call depth limit (${MAX_AGENT_DEPTH}) reached on chain ` +
        `${stack.join(' -> ')}. Decide with what you have.`,
    };
  }

  // The graph is acyclic today, but guard anyway so a future edge cannot hang.
  const target = name.startsWith('ask_agent1')
    ? 'agent1'
    : name.startsWith('ask_agent2')
      ? 'agent2'
      : 'agent3';
  if (stack.includes(target)) {
    return { error: `${target} is already on this call chain; refusing to recurse.` };
  }

  try {
    return await handler(args ?? {}, { stack: [...stack, target] });
  } catch (error) {
    return { error: `${name} failed: ${error.message}` };
  }
}
