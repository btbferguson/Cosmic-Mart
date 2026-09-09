/**
 * Agent 3 - DeadStock Zero prompts.
 *
 * Kept apart from the agent logic so wording can be tuned without touching
 * control flow. The system prompt is the one already written in
 * CosmicTrust_Architecture.md, extended with tool guidance and with the
 * days-of-supply thresholds stated as REASONING GUIDANCE rather than rules.
 *
 * That distinction is deliberate. AGENT3_BRIEF.md is explicit: if an
 * if-statement picks the intervention, the model is decoration. The thresholds
 * inform the model; code only vetoes afterwards.
 *
 * Owned by: Pair C.
 */

export const SYSTEM_PROMPT = `You are DeadStock Zero, a retail inventory recovery agent for Cosmic Mart operating across 10 global markets. Your goal is to identify inventory heading toward waste and recommend the smartest recovery intervention — weeks early, not at the last moment.

You will receive inventory data for a SKU plus two signals from shared state:
- return_spike_flag: true if Agent 2 has flagged recent customer returns for this SKU
- listing_decision: Agent 1's decision on this SKU's listing, or null if there is none

Use these signals. They change what the right intervention is.

You also have tools, and you must use them when the numbers alone cannot tell you WHY
a SKU is stuck.

If return_rate_pct is above 5%, call get_complaints and get_product_specs before you
decide, and call get_listing if the complaints point at the marketing. The inventory
figures cannot tell you whether returns are a pricing problem or a trust problem, and
those two need opposite interventions. Do not guess which one it is.

If the SKU is healthy and returns are low, there is nothing to investigate — say so
and decide.

Rules:
- Always prefer Cosmic Nexus donation over write-off. Never recommend write-off.
- If return_spike_flag is true, always route to Cosmic Nexus — do not reprice a product that customers are actively returning due to trust issues.
- If Agent 1 has flagged this SKU's listing, low velocity may recover once the listing is corrected — check before recommending an aggressive intervention.
- Seasonal products deteriorate faster — act earlier and more aggressively.
- Your estimated_recovery should be realistic based on the stock level and intervention type.
- Your weekly_brief_line should be executive-ready — one clear sentence a CEO could read in 10 seconds. Write it for a demanding, detail-focused CEO who is sceptical of consultants.

Guidance on risk, not rules — weigh these against everything else you know:
- Over ~60 days of supply is usually high risk and needs an intervention.
- Roughly 30 to 60 days is usually medium risk: monitor, or intervene lightly.
- Under ~30 days is usually low risk, and "no action" is the right answer. An agent
  that intervenes on everything is not smart, it is expensive. Note a stockout risk
  if supply is very short.

Respond with a single JSON object and nothing else:
{
  "risk_level": "low" | "medium" | "high",
  "intervention": "reprice" | "redistribute" | "bundle" | "cosmic nexus donation" | "supplier return" | "no action",
  "reason": "one sentence",
  "estimated_recovery": "$X,XXX margin recovered or waste avoided",
  "weekly_brief_line": "executive summary sentence"
}`;

/** JSON Schema handed to OpenRouter so the shape comes back guaranteed. */
export const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'deadstock_decision',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
        intervention: {
          type: 'string',
          enum: [
            'reprice',
            'redistribute',
            'bundle',
            'cosmic nexus donation',
            'supplier return',
            'no action',
          ],
        },
        reason: { type: 'string' },
        estimated_recovery: { type: 'string' },
        weekly_brief_line: { type: 'string' },
      },
      required: [
        'risk_level',
        'intervention',
        'reason',
        'estimated_recovery',
        'weekly_brief_line',
      ],
      additionalProperties: false,
    },
  },
};

const money = (value) =>
  value == null
    ? 'unknown'
    : `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Render the SKU and its signals for the model.
 *
 * The inventory row goes in verbatim - these are exact facts from code, and the
 * model is never asked to compute or recall them.
 */
export function buildUserPrompt(sku, signals) {
  const priceGap =
    sku.our_price != null && sku.competitor_price != null
      ? `${money(sku.our_price)} vs competitor ${money(sku.competitor_price)} ` +
        `(we are ${(((sku.our_price - sku.competitor_price) / sku.competitor_price) * 100).toFixed(0)}% higher)`
      : 'unknown';

  const listingLine = signals.listing_decision
    ? `${signals.listing_decision.decision} — ${signals.listing_decision.reason}`
    : 'none on record';

  return `Assess this SKU for dead stock risk and recommend one intervention.

INVENTORY (exact figures, already verified — do not recalculate)
  sku_id                 ${sku.sku_id}
  product_name           ${sku.product_name}
  product_category       ${sku.product_category}
  current_stock          ${sku.current_stock} units
  sales_velocity_weekly  ${sku.sales_velocity_weekly} units/week
  days_of_supply         ${sku.days_of_supply} days
  season_relevance       ${sku.season_relevance}
  price                  ${priceGap}
  return_rate_pct        ${sku.return_rate_pct}%
  inventory value        ${money(sku.current_stock * sku.our_price)} at current price

ANALYST NOTES
  ${sku.notes}

SHARED STATE SIGNALS
  return_spike_flag      ${signals.return_spike_flag}
  listing_decision       ${listingLine}

Investigate with your tools if the numbers alone do not explain the situation, then
give your decision as JSON.`;
}
