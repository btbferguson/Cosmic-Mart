/**
 * Agent 3 - DeadStock Zero.
 *
 * Reads a SKU, reasons over it, and returns one of six interventions.
 *
 * The shape of the loop:
 *   read shared state -> build prompt -> let the model call tools
 *     -> final structured answer -> validate against the contract
 *     -> code guardrails get the last word
 *
 * The model chooses. Code vetoes. Those are different jobs and keeping them
 * apart is the point: a judge asking "what stops it doing something stupid?"
 * should get a function, not a paragraph of the system prompt.
 *
 * Owned by: Pair C.
 */

import {
  callModel,
  textOf,
  toolCallsOf,
  reasoningOf,
  finishReasonOf,
  usageOf,
  extractJSON,
} from '../openrouter.js';
import { validate, AGENT3_OUTPUT } from '../contracts.js';
import { hasReturnSpike, sharedState } from '../state.js';
import { getEnrichedSku } from '../data/loadData.js';
import { TOOL_DEFS, executeTool } from './agent3_tools.js';
import { SYSTEM_PROMPT, RESPONSE_FORMAT, buildUserPrompt } from '../prompts/prompt_agent3.js';

/** Stop the model looping forever on tool calls. Four is generous for four tools. */
const MAX_TOOL_TURNS = 4;

/* ------------------------------------------------------------------ *
 * Shared state
 * ------------------------------------------------------------------ */

/**
 * Pull the two cross-agent signals for a SKU.
 *
 * These come from Agents 2 and 1 through src/state.js. When those agents do not
 * exist yet the state is simply empty, and the agent still runs - it just has
 * less to go on. Nothing here fakes a signal.
 */
export function readSignals(skuId) {
  const decisions = sharedState.listingDecisionLog.filter((entry) => entry.sku_id === skuId);
  return {
    return_spike_flag: hasReturnSpike(skuId),
    listing_decision: decisions.length ? decisions[decisions.length - 1] : null,
  };
}

/* ------------------------------------------------------------------ *
 * Guardrails - code, not prompt
 * ------------------------------------------------------------------ */

/**
 * The non-negotiables, enforced after the model has spoken.
 *
 * Right now there is one: a SKU customers are actively returning must go to
 * Cosmic Nexus, never to a discount. Repricing a product people are sending
 * back because it does not do what the listing said turns a trust problem into
 * a cheaper trust problem.
 *
 * When this fires we keep what the model chose, so the CLI can show the
 * override rather than quietly papering over it.
 */
export function applyGuardrails(decision, signals) {
  if (signals.return_spike_flag && decision.intervention !== 'cosmic nexus donation') {
    return {
      ...decision,
      intervention: 'cosmic nexus donation',
      risk_level: 'high',
      guardrail: {
        rule: 'return_spike_flag forces cosmic nexus donation',
        model_chose: decision.intervention,
      },
    };
  }
  return decision;
}

/* ------------------------------------------------------------------ *
 * The agent
 * ------------------------------------------------------------------ */

/**
 * Triage one SKU.
 *
 * @param {string}   skuId
 * @param {object}   [options]
 * @param {Function} [options.onEvent] progress callback for the CLI - receives
 *                                     {type:'thinking'|'tool'|'answer', ...}
 * @returns {Promise<object>} the validated, guardrailed decision plus a trace
 */
export async function assessSku(skuId, { onEvent = () => {} } = {}) {
  const sku = getEnrichedSku(skuId);
  if (!sku) throw new Error(`Unknown SKU: ${skuId}`);

  const signals = readSignals(skuId);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(sku, signals) },
  ];

  const trace = { toolCalls: [], turns: 0, usage: { in: 0, out: 0, cost: 0 } };

  const account = (response) => {
    const usage = usageOf(response);
    trace.usage.in += usage.in;
    trace.usage.out += usage.out;
    trace.usage.cost += usage.cost;
  };

  // ---- Phase 1: investigation -------------------------------------
  // Tools are offered WITHOUT response_format. Sending a JSON schema on the
  // same turn as tools makes the model emit the object immediately instead of
  // calling anything - which is how you end up with a classifier wearing an
  // agent's clothes.
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await callModel({ agent: 'agent3', messages, tools: TOOL_DEFS });
    account(response);
    trace.turns++;

    const reasoning = reasoningOf(response);
    if (reasoning) onEvent({ type: 'thinking', text: reasoning });

    const toolCalls = toolCallsOf(response);
    if (toolCalls.length === 0) {
      // Nothing more it wants to look up. Keep any analysis it wrote.
      const said = textOf(response);
      if (said.trim()) messages.push({ role: 'assistant', content: said });
      break;
    }

    // The tool_calls message must precede its results.
    messages.push({
      role: 'assistant',
      content: textOf(response) || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        // Leave args empty; executeTool reports a readable error back.
      }

      const result = executeTool(call.function.name, args);
      trace.toolCalls.push({ name: call.function.name, args, result });
      onEvent({ type: 'tool', name: call.function.name, args, result });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // ---- Phase 2: the decision --------------------------------------
  // No tools, schema enforced. One call, guaranteed shape.
  messages.push({
    role: 'user',
    content: 'Now give your final decision as a single JSON object.',
  });

  const final = await callModel({
    agent: 'agent3',
    messages,
    responseFormat: RESPONSE_FORMAT,
    // Reasoning is charged against this and cannot be switched off, so the
    // decision call gets plenty of headroom. Unused budget costs nothing.
    maxTokens: 8000,
  });
  account(final);
  trace.turns++;

  const raw = textOf(final);
  if (!raw.trim()) {
    const why = finishReasonOf(final);
    throw new Error(
      why === 'length'
        ? `${skuId}: the model used its whole token budget on reasoning and never ` +
          `produced an answer. Raise maxTokens on the decision call.`
        : `${skuId}: model returned no content (finish_reason: ${why})`
    );
  }

  const parsed = extractJSON(raw);
  validate('agent3', AGENT3_OUTPUT, parsed);

  const decision = applyGuardrails(parsed, signals);
  onEvent({ type: 'answer', decision });

  return { sku, signals, decision, trace };
}
