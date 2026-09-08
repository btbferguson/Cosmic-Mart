# CosmicTrust — System Architecture

**Version:** 1.0  
**Project:** Accenture Case Competition — Cosmic Mart  
**Date:** September 2026  
**Team:** Zeynep, Zoe, Devin, Kuria, Anshi, Bryant

---

## Overview

CosmicTrust is a three-agent agentic AI system built on Claude (claude-sonnet-4-6) that addresses Cosmic Mart's core trust crisis. The system operates across three causal layers: preventing misleading claims before they reach customers (Agent 1), resolving customer issues with real authority when something goes wrong (Agent 2), and recovering the inventory waste that broken trust creates (Agent 3).

The three agents are not independent tools. They share signals, feed each other data, and improve each other over time. This is what makes CosmicTrust a system rather than three separate features.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        INPUTS                               │
│   Product Listings    Customer Events    Inventory Data      │
└────────────┬──────────────────┬──────────────────┬──────────┘
             │                  │                  │
             ▼                  ▼                  ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
│   AGENT 1      │  │   AGENT 2      │  │   AGENT 3          │
│  Fact Checker  │  │   Customer     │  │  DeadStock Zero    │
│                │  │   Resolution   │  │                    │
│ Human-in-loop  │  │                │  │                    │
└────────┬───────┘  └───────┬────────┘  └────────────────────┘
         │                  │                    ▲
         │    ◄─────────────┘                    │
         │    complaint_pattern_tag               │
         │                                       │
         └───────────────────────────────────────┘
              accurate demand signals + return spike flag
```

---

## Shared State Object

All three agents read from and write to a shared JavaScript object that persists for the duration of the demo session. This is the connective tissue of the system.

```javascript
const sharedState = {
  // Written by Agent 2, read by Agent 1
  complaintPatternLog: [
    {
      complaint_pattern_tag: "misleading description",
      product_category: "gadgets",
      sku_id: "SKU-4821",
      timestamp: "2026-09-09T10:23:00Z"
    }
  ],

  // Written by Agent 2, read by Agent 3
  returnSpikeFlags: {
    "SKU-4821": true,
    "SKU-3302": false
  },

  // Written by Agent 1, available for audit
  listingDecisionLog: [
    {
      product_name: "UltraCharge Pro",
      decision: "escalate",
      confidence: "high",
      reason: "Claim '10x faster charging' is unverified",
      timestamp: "2026-09-09T09:45:00Z"
    }
  ]
}
```

---

## Agent 1 — Fact Checker

### Purpose

Intercept every product listing, promotion, and ad before it goes live. Assess every claim for accuracy, compliance, and honesty. Either clear it automatically or escalate to a human reviewer with a precise recommendation.

### Core Principle

The agent never makes the final call on a blocked or escalated listing. It flags, explains, and recommends. A human reviewer always has the final decision. This is a hard rule — not optional.

### Inputs

| Field | Type | Description |
|-------|------|-------------|
| `product_name` | string | Name of the product |
| `product_description` | string | Full product description text |
| `claims` | string | Any promotional claims or ad copy |
| `market_region` | string | Which of the 10 Cosmic Mart markets (compliance rules vary) |
| `product_category` | string | e.g. "health", "gadgets", "fashion" — drives strictness calibration |
| `complaint_pattern_log` | array | Fed from shared state — recent complaint tags for this category |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `decision` | enum | `"approved"` / `"escalate"` / `"auto-blocked"` |
| `confidence` | enum | `"high"` / `"medium"` / `"low"` |
| `reason` | string | One sentence explaining the decision |
| `recommendation_to_reviewer` | string | Only populated when `decision` is `"escalate"` — tells the human exactly what to look at and what to do |
| `complaint_signal` | string | Category tag for the feedback loop (e.g. `"unverified statistic"`, `"misleading comparison"`) |

### Decision Logic

```
"approved"      → claim is clearly fine, verifiable from product details provided,
                  no flags in complaint_pattern_log for this category.
                  Auto-cleared. No human needed.

"escalate"      → agent has concerns but is not certain. Human must review
                  before listing goes live. recommendation_to_reviewer is
                  populated with specific guidance.

"auto-blocked"  → claim is an obvious violation — illegal health claim,
                  demonstrably false statistic, or directly matches a known
                  complaint pattern tag. Listing is held immediately.
                  Human is notified but the hold is automatic.
```

### Human-in-the-Loop Flow

```
Listing submitted
      │
      ▼
Agent 1 assesses
      │
      ├── "approved" ──────────────────────► Listing goes live automatically
      │
      ├── "auto-blocked" ──────────────────► Listing held + human notified
      │                                      Human can override if needed
      │
      └── "escalate" ──────────────────────► Human review queue
                                             Reviewer sees:
                                               - The listing
                                               - Agent's reason
                                               - Agent's recommendation
                                               - [Approve] or [Keep blocked]
                                             Human makes final decision
```

### What the Human Reviewer UI Shows

- The full listing text
- The agent's `reason` field
- The agent's `recommendation_to_reviewer` field
- Two action buttons: **Approve listing** / **Keep blocked**
- A confidence indicator (high/medium/low) to signal urgency

### System Prompt (to be used in API call)

```
You are a pre-publication compliance checker for Cosmic Mart, a global retail company 
operating across 10 markets. Your job is to assess product listings before they go live 
and identify any claims that are misleading, unverifiable, or non-compliant.

You are an AI compliance ASSISTANT, not a compliance officer. You surface problems and 
recommend actions — you do not make final decisions on escalated cases.

Rules:
- If a claim cannot be verified from the product details provided, flag it.
- Health and medical claims require the highest level of scrutiny.
- If you are uncertain, always escalate rather than approve.
- Be precise about what you are uncertain about so the human reviewer knows exactly 
  where to focus.
- Check the complaint_pattern_log — if this product category has recent complaint 
  patterns matching the claim type, weight that heavily toward escalation.

Always respond in this exact JSON format:
{
  "decision": "approved" | "escalate" | "auto-blocked",
  "confidence": "high" | "medium" | "low",
  "reason": "one sentence",
  "recommendation_to_reviewer": "specific guidance for the human — only populate 
                                  when decision is escalate",
  "complaint_signal": "short category tag"
}
```

### Feedback Loop from Agent 2

Every time Agent 2 resolves a complaint and tags it with a `complaint_pattern_tag`, that tag is written to `sharedState.complaintPatternLog`. Agent 1 reads this log on every new listing assessment. If a listing's claims match a recent complaint pattern in the same product category, the agent increases its escalation sensitivity automatically.

---

## Agent 2 — Customer Resolution

### Purpose

Receive a customer complaint and resolve it with a specific, concrete action. No scripts. No redirects to policy pages. Real authority — the agent can approve refunds, waive fees, and dispatch replacements.

### Inputs

| Field | Type | Description |
|-------|------|-------------|
| `customer_name` | string | Customer's name |
| `order_id` | string | Order reference (can be fake for demo) |
| `complaint_description` | string | Full complaint text |
| `customer_history` | string | Summary of customer relationship (e.g. "loyal customer, 3 years, first complaint") |
| `emotional_tone` | enum | `"frustrated"` / `"angry"` / `"calm"` — set manually for demo |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `action_taken` | string | The specific resolution (e.g. "full refund approved", "replacement dispatched", "fee waived") |
| `response_to_customer` | string | The message the customer receives |
| `complaint_pattern_tag` | string | Category tag written to shared state (e.g. `"misleading description"`, `"wrong item"`, `"damaged delivery"`) |
| `escalate_to_human` | boolean | True if the case is too complex for the agent to resolve |

### Authority Boundaries

The agent operates within these guardrails — no human approval needed:

- Full refund up to $500
- Fee waiver (any amount)
- Replacement dispatch
- Partial refund or store credit

Human escalation required for:

- Refunds above $500
- Legal or regulatory complaints
- Cases where the customer is threatening legal action
- Repeat complaints from the same customer about the same issue

### Signal Written to Shared State

After every resolution, Agent 2 writes to `sharedState`:

```javascript
// Written to complaintPatternLog (read by Agent 1)
sharedState.complaintPatternLog.push({
  complaint_pattern_tag: result.complaint_pattern_tag,
  product_category: derivedFromComplaint,
  sku_id: derivedFromOrderId,
  timestamp: new Date().toISOString()
})

// Written to returnSpikeFlags (read by Agent 3)
if (result.action_taken.includes("refund") || result.action_taken.includes("replacement")) {
  sharedState.returnSpikeFlags[skuId] = true
}
```

### System Prompt

```
You are the Customer Resolution agent for Cosmic Mart. You have real authority to resolve 
customer complaints. You can approve refunds up to $500, waive fees, and dispatch 
replacements — without asking for human approval.

Rules:
- Never say "please contact support" or refer the customer elsewhere.
- Never quote policy at the customer. Solve the problem.
- Match your tone to the customer's emotional state — be warmer with frustrated customers, 
  more efficient with calm ones.
- Loyal customers with a good history get the benefit of the doubt.
- Always categorise the complaint with a complaint_pattern_tag — this is critical for 
  the system's learning loop.
- If the case exceeds your authority, set escalate_to_human to true and explain why.

Always respond in this exact JSON format:
{
  "action_taken": "specific action",
  "response_to_customer": "message to send",
  "complaint_pattern_tag": "category tag",
  "escalate_to_human": true | false
}
```

---

## Agent 3 — DeadStock Zero

### Purpose

Identify inventory at risk of becoming dead stock weeks before it gets there, and autonomously execute the best recovery intervention — repricing, redistribution, bundling, Cosmic Nexus donation routing, or supplier return negotiation.

### Inputs

| Field | Type | Description |
|-------|------|-------------|
| `sku_name` | string | Product name |
| `sku_description` | string | Brief product description |
| `current_stock` | number | Units currently in inventory |
| `sales_velocity` | number | Units sold per week |
| `days_of_supply` | number | current_stock ÷ sales_velocity |
| `season_relevance` | enum | `"seasonal"` / `"evergreen"` |
| `competitor_price` | number | Optional — current competitor price for same/similar item |
| `return_spike_flag` | boolean | Fed from sharedState.returnSpikeFlags — true if Agent 2 has flagged recent returns for this SKU |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `risk_level` | enum | `"low"` / `"medium"` / `"high"` |
| `intervention` | enum | `"reprice"` / `"redistribute"` / `"bundle"` / `"cosmic nexus donation"` / `"supplier return"` / `"no action"` |
| `reason` | string | One sentence explaining the intervention choice |
| `estimated_recovery` | string | Illustrative financial recovery figure (e.g. "$4,200 margin recovered") |
| `weekly_brief_line` | string | One sentence for the leadership summary report |

### Intervention Selection Logic

```
return_spike_flag = true     → Cosmic Nexus donation (trust has broken; 
                               don't reprice a product customers are returning)

days_of_supply > 60          → High risk. Intervention required.
  + seasonal product         → Redistribute to markets still in season, 
                               or bundle if redistribution not viable
  + evergreen product        → Reprice first; Cosmic Nexus if velocity 
                               doesn't recover within threshold

days_of_supply 30–60         → Medium risk. Monitor or light intervention.
  + competitor_price lower   → Reprice to match
  + no competitor pressure   → No action yet, flag for next week's brief

days_of_supply < 30          → Low risk. No action.
```

### Cosmic Nexus Priority Rule

The system prompt instructs the agent to always prefer Cosmic Nexus donation routing over write-off. This is a hard rule. The Cosmic Nexus program (Cosmic Mart's community donation initiative) sits unused in the current business — this agent activates it. Donation routing generates a sustainability story, avoids landfill, and is better for the brand than a 70% markdown.

### System Prompt

```
You are DeadStock Zero, a retail inventory recovery agent for Cosmic Mart operating 
across 10 global markets. Your goal is to identify inventory heading toward waste and 
execute the smartest recovery intervention — weeks early, not at the last moment.

Rules:
- Always prefer Cosmic Nexus donation over write-off. Never recommend write-off.
- If return_spike_flag is true, always route to Cosmic Nexus — do not reprice a 
  product that customers are actively returning.
- Seasonal products deteriorate faster — act earlier and more aggressively.
- Your estimated_recovery should be illustrative but realistic based on the 
  stock level and intervention type.
- Your weekly_brief_line should be executive-ready — one clear sentence a CEO 
  could read in 10 seconds.

Always respond in this exact JSON format:
{
  "risk_level": "low" | "medium" | "high",
  "intervention": "reprice" | "redistribute" | "bundle" | 
                  "cosmic nexus donation" | "supplier return" | "no action",
  "reason": "one sentence",
  "estimated_recovery": "$X,XXX margin recovered / waste avoided",
  "weekly_brief_line": "executive summary sentence"
}
```

---

## How the Agents Connect

### Connection 1 — Agent 2 → Agent 1 (complaint feedback loop)

Every time Agent 2 resolves a complaint tagged as `"misleading description"`, that tag is logged to `sharedState.complaintPatternLog`. The next time Agent 1 assesses a listing in the same product category, it reads this log and increases its scrutiny. Over time, listings from categories with repeated complaint patterns get flagged more aggressively.

This means the system learns where trust breaks — because it is watching both ends simultaneously.

### Connection 2 — Agent 2 → Agent 3 (return spike signal)

When Agent 2 approves a refund or replacement for a product, it sets `sharedState.returnSpikeFlags[skuId] = true`. Agent 3 reads this flag as an input on its next inventory scan. A return spike on a SKU is a trust signal, not just an inventory signal — it means the product is coming back because customers don't trust what they bought. Agent 3 responds by routing to Cosmic Nexus donation rather than repricing, because repricing a product customers are returning is not a recovery strategy.

### Connection 3 — Agent 1 → Agent 3 (accurate demand signals)

When Agent 1 blocks or corrects a listing, it writes to `sharedState.listingDecisionLog`. Agent 3 can use this to understand whether a SKU's low sales velocity is genuine low demand or artificial demand collapse caused by misleading claims that were subsequently blocked. This prevents DeadStock Zero from triggering unnecessary interventions on SKUs that will recover once the correct listing goes live.

---

## Demo Sequence (3 minutes)

### Step 1 — Agent 1 catches a false claim (45 seconds)

Input a product listing for "UltraCharge Pro" with the claim: *"clinically proven to charge 10x faster than any competitor."*

Agent 1 returns `decision: "escalate"`, `confidence: "high"`, with a recommendation to the human reviewer to request clinical trial documentation before approving.

Human reviewer clicks **Keep blocked**. Decision is logged.

### Step 2 — Agent 2 resolves a complaint and triggers the feedback loop (60 seconds)

Input a complaint from a customer who received a product that didn't match its description. Agent 2 issues a full refund and tags it `complaint_pattern_tag: "misleading description"`.

Show the `sharedState.complaintPatternLog` updating in real time. Show Agent 1 being re-invoked on the same product category with higher scrutiny on its next call.

### Step 3 — Agent 3 catches dead stock and routes to Cosmic Nexus (45 seconds)

Input a SKU with 200 units, 2 units/week velocity, 100 days of supply, seasonal product, `return_spike_flag: true`.

Agent 3 returns `intervention: "cosmic nexus donation"`, `risk_level: "high"`, `estimated_recovery: "$6,400 waste avoided"`.

Show the weekly brief line that would appear in the leadership report.

### Close — The loop closes (30 seconds)

Show the shared state object. Explain: Agent 2's complaint pattern fed back to Agent 1. Agent 2's return spike fed into Agent 3. Agent 1's listing correction fed accurate demand signals back into Agent 3. The system is watching both ends simultaneously — that is what makes it agentic rather than automated.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| AI model | Claude claude-sonnet-4-6 via Anthropic API |
| Language | JavaScript (Node.js) |
| SDK | `@anthropic-ai/sdk` |
| Shared state | In-memory JavaScript object (demo scope) |
| Demo UI | Single HTML page with one panel per agent |
| Data | Hardcoded mock data for demo inputs |

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Agent returns malformed JSON | Strip markdown fences before parsing; wrap in try/catch |
| Human reviewer step feels slow in demo | Pre-stage the escalation — have the listing already in queue when demo starts |
| Agents give inconsistent decisions on same input | Fix the temperature to 0 in API calls for deterministic demo output |
| Shared state not updating visibly | Show the state object on screen in real time during the demo |
| Agent 1 approves something it should flag | Tune the system prompt — add explicit examples of what to flag |

---

## Open Questions (to resolve by Wednesday)

- [ ] What UI framework for the demo interface? (plain HTML recommended for simplicity)
- [ ] How to handle Agent 1 timeout if human reviewer doesn't respond? (needs a timeout rule)
- [ ] Should Agent 2's escalation also route through a human UI, or just return the flag?
- [ ] Who owns the shared state connection code? (recommend: Kuria or Zeynep)
- [ ] Do we show all three agent panels simultaneously or step through them one at a time?

---

*Document prepared for internal team use — Accenture Case Competition, September 2026*
