# CosmicTrust — System Architecture

**Version:** 2.0  
**Project:** Accenture Case Competition — Cosmic Mart  
**Date:** September 2026  
**Team:** Zeynep, Zoe, Devin, Kuria, Anshi, Bryant

---

## Overview

CosmicTrust is a three-agent agentic AI system built on Claude (claude-sonnet-4-6) that addresses Cosmic Mart's core trust crisis. The system operates across three causal layers: detecting inaccurate or misleading product listings before they reach customers (Agent 1), resolving customer issues with real authority when something goes wrong (Agent 2), and recovering the inventory waste that broken trust creates (Agent 3).

The three agents are not independent tools. They share signals, feed each other data, and improve each other over time. This is what makes CosmicTrust a system rather than three separate features.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              INPUTS                                  │
│  cosmic_mart_products.csv   cosmic_mart_complaints.csv               │
│  cosmic_mart_listings.csv   cosmic_mart_inventory.csv                │
└───────────┬─────────────────────────┬──────────────────┬─────────────┘
            │                         │                  │
            ▼                         ▼                  ▼
┌────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐
│     AGENT 1        │  │      AGENT 2         │  │     AGENT 3        │
│   Fact Checker     │  │  Customer Resolution │  │  DeadStock Zero    │
│                    │  │                      │  │                    │
│  Compares listing  │  │  Resolves complaints │  │  Recovers at-risk  │
│  claims against    │  │  with real authority │  │  inventory before  │
│  product specs     │  │                      │  │  it becomes waste  │
│                    │  │                      │  │                    │
│  Human-in-loop     │  │                      │  │                    │
└──────────┬─────────┘  └──────────┬───────────┘  └────────────────────┘
           │                       │                         ▲
           │         ◄─────────────┘                         │
           │         complaint_pattern_tag                    │
           │                                                  │
           └──────────────────────────────────────────────────┘
                    listing_decision_log + return_spike_flag
```

---

## Directory

```
cosmictrust/
├── README.md
├── .env
├── .gitignore
├── package.json
├── data/
│   ├── cosmic_mart_products.csv
│   ├── cosmic_mart_listings.csv
│   ├── cosmic_mart_complaints.csv
│   └── cosmic_mart_inventory.csv
├── state/
│   └── sharedState.js
├── agents/
│   ├── agent1_factchecker.js
│   ├── agent2_resolution.js
│   └── agent3_deadstock.js
├── prompts/
│   ├── prompt_agent1.js
│   ├── prompt_agent2.js
│   └── prompt_agent3.js
├── ui/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/
│   ├── test_agent1.js
│   ├── test_agent2.js
│   └── test_agent3.js
└── docs/
    ├── CosmicTrust_Architecture.md
    └── demo_script.md
```

---

## Data Files

The system uses four CSV files as its data layer. These are the ground truth inputs for each agent.

### `cosmic_mart_products.csv`
Backend spec sheet. Plain factual data — what each product actually is, its real specifications, materials, and capabilities. No marketing language. This is what Agent 1 compares listings against.

| Column | Description |
|--------|-------------|
| `sku_id` | Unique product identifier (SKU-1001 to SKU-1050) |
| `product_name` | Product name |
| `product_category` | gadgets / fashion / home and lifestyle |
| `specs` | Full technical specification in plain factual language |

### `cosmic_mart_listings.csv`
What customers currently see on the product page. This is what Agent 1 checks for accuracy against the spec sheet. Some listings contain claims that do not match the product specs — these are the cases the agent is designed to catch.

| Column | Description |
|--------|-------------|
| `sku_id` | Links to `cosmic_mart_products.csv` |
| `product_name` | Product name |
| `listing_description` | Current customer-facing description |
| `listing_claims` | Current promotional claims shown to customers |

### `cosmic_mart_complaints.csv`
Incoming customer complaints. Agent 2 reads these and resolves them. Several complaints are from customers who experienced a problem caused directly by an inaccurate listing — these complaints are the downstream evidence of Agent 1's problem space.

| Column | Description |
|--------|-------------|
| `complaint_id` | Unique complaint identifier (CMP-001 to CMP-020) |
| `customer_name` | Customer name |
| `order_id` | Order reference |
| `sku_id` | Links to product |
| `product_name` | Product name |
| `complaint_description` | Full complaint text as submitted by the customer |
| `customer_history` | Summary of customer relationship (tenure, order count, tier) |
| `emotional_tone` | frustrated / angry / calm |

### `cosmic_mart_inventory.csv`
Current inventory snapshot across all 50 SKUs. Agent 3 reads this to identify at-risk stock. Return rate is included as a signal — SKUs with elevated return rates often correspond to products where Agent 1 has flagged a listing issue.

| Column | Description |
|--------|-------------|
| `sku_id` | Links to product |
| `product_name` | Product name |
| `product_category` | gadgets / fashion / home and lifestyle |
| `current_stock` | Units currently held |
| `sales_velocity_weekly` | Units sold per week |
| `days_of_supply` | current_stock ÷ sales_velocity_weekly (pre-calculated) |
| `season_relevance` | seasonal / evergreen |
| `our_price` | Current Cosmic Mart selling price |
| `competitor_price` | Equivalent competitor price |
| `return_rate_pct` | Percentage of units sold being returned |
| `notes` | Context on why a SKU is at risk — links to Agent 1 flags where relevant |

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
      sku_id: "SKU-1001",
      timestamp: "2026-09-09T10:23:00Z"
    }
  ],

  // Written by Agent 2, read by Agent 3
  returnSpikeFlags: {
    "SKU-1001": true,
    "SKU-1002": true
  },

  // Written by Agent 1, read by Agent 3
  listingDecisionLog: [
    {
      sku_id: "SKU-1001",
      product_name: "UltraCharge Pro 9000",
      decision: "escalate",
      confidence: "high",
      reason: "Claim '10x faster than any competitor' is unverified and inconsistent with product specs showing 15W output comparable to standard Qi chargers",
      timestamp: "2026-09-09T09:45:00Z"
    }
  ]
}
```

---

## Agent 1 — Fact Checker

### Purpose

Compare each product listing against the product spec sheet and identify any claims that are inaccurate, unverifiable, or inconsistent with what the product actually is. Either clear the listing automatically or escalate to a human reviewer with a precise recommendation.

### Core Principle

The agent never makes the final call on a blocked or escalated listing. It flags, explains, and recommends. A human reviewer always has the final decision. This is a hard rule — not optional.

### Inputs

Agent 1 takes a matched pair of rows — one from `cosmic_mart_products.csv` and one from `cosmic_mart_listings.csv` for the same `sku_id` — plus the complaint pattern log from shared state.

| Field | Source | Description |
|-------|--------|-------------|
| `sku_id` | Both files | Used to match the two rows |
| `product_name` | products CSV | Product name |
| `specs` | products CSV | The ground truth — what the product actually is |
| `listing_description` | listings CSV | Current customer-facing description |
| `listing_claims` | listings CSV | Current promotional claims |
| `product_category` | products CSV | Drives strictness calibration |
| `complaint_pattern_log` | shared state | Recent complaint tags for this category — increases scrutiny if matches exist |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `decision` | enum | `"approved"` / `"escalate"` / `"auto-blocked"` |
| `confidence` | enum | `"high"` / `"medium"` / `"low"` |
| `reason` | string | One sentence explaining the decision |
| `recommendation_to_reviewer` | string | Only populated when decision is `"escalate"` — tells the human exactly what to check |
| `complaint_signal` | string | Category tag for the feedback loop (e.g. `"unverified statistic"`, `"missing specification"`) |

### Decision Logic

```
"approved"      → listing claims are consistent with the product specs,
                  no material discrepancies found, no matching complaint
                  patterns in the log for this category.
                  Auto-cleared. No human needed.

"escalate"      → agent has identified a discrepancy or unverifiable claim
                  but is not certain it is intentional or harmful.
                  Human must review before listing goes live.
                  recommendation_to_reviewer is populated with specific guidance.

"auto-blocked"  → listing makes a claim that directly contradicts the product
                  specs, constitutes an illegal claim (e.g. unauthorised health
                  or medical claim), or matches a known complaint pattern tag.
                  Listing is held immediately. Human is notified but the
                  hold is automatic.
```

### Human-in-the-Loop Flow

```
Product spec + Listing submitted
          │
          ▼
Agent 1 compares and assesses
          │
          ├── "approved" ───────────────────────► Listing goes live automatically
          │
          ├── "auto-blocked" ───────────────────► Listing held + human notified
          │                                       Human can override if needed
          │
          └── "escalate" ───────────────────────► Human review queue
                                                  Reviewer sees:
                                                    - Product specs
                                                    - Current listing
                                                    - Agent's reason
                                                    - Agent's recommendation
                                                    - [Approve] or [Keep blocked]
                                                  Human makes final decision
```

### What the Human Reviewer UI Shows

- The product spec (ground truth)
- The current listing text and claims
- The agent's `reason` field
- The agent's `recommendation_to_reviewer` field
- Two action buttons: **Approve listing** / **Keep blocked**
- A confidence indicator (high / medium / low) to signal urgency

### System Prompt

```
You are a pre-publication compliance checker for Cosmic Mart, a global retail company 
operating across 10 markets. Your job is to compare product listings against the 
product's actual specifications and identify any claims that are inaccurate, 
exaggerated, or inconsistent with what the product really is.

You will receive:
- specs: the ground truth about what the product actually is
- listing_description and listing_claims: what customers currently see

Your job is to find the gaps.

You are an AI compliance ASSISTANT, not a compliance officer. You surface problems and 
recommend actions — you do not make final decisions on escalated cases.

Rules:
- If a listing claim cannot be supported by the specs provided, flag it.
- Health and medical claims require the highest level of scrutiny — flag immediately.
- If you are uncertain, always escalate rather than approve.
- Be precise about the specific discrepancy so the human reviewer knows exactly 
  where to focus.
- Check the complaint_pattern_log — if this product category has recent complaint 
  patterns matching the claim type, weight that heavily toward escalation or auto-block.

Always respond in this exact JSON format:
{
  "decision": "approved" | "escalate" | "auto-blocked",
  "confidence": "high" | "medium" | "low",
  "reason": "one sentence identifying the specific discrepancy or confirming accuracy",
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

Drawn from `cosmic_mart_complaints.csv`, one row per complaint.

| Field | Source | Description |
|-------|--------|-------------|
| `complaint_id` | complaints CSV | Unique complaint reference |
| `customer_name` | complaints CSV | Customer name |
| `order_id` | complaints CSV | Order reference |
| `sku_id` | complaints CSV | Links to product — used to write return spike flag |
| `product_name` | complaints CSV | Product name |
| `complaint_description` | complaints CSV | Full complaint text |
| `customer_history` | complaints CSV | Tenure, order count, tier |
| `emotional_tone` | complaints CSV | frustrated / angry / calm |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `action_taken` | string | The specific resolution (e.g. "full refund approved", "replacement dispatched") |
| `response_to_customer` | string | The message the customer receives |
| `complaint_pattern_tag` | string | Category tag written to shared state |
| `escalate_to_human` | boolean | True if the case exceeds the agent's authority |

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

After every resolution, Agent 2 writes to shared state:

```javascript
// Written to complaintPatternLog (read by Agent 1)
sharedState.complaintPatternLog.push({
  complaint_pattern_tag: result.complaint_pattern_tag,
  product_category: derivedFromSku,
  sku_id: complaint.sku_id,
  timestamp: new Date().toISOString()
})

// Written to returnSpikeFlags (read by Agent 3)
if (result.action_taken.includes("refund") || result.action_taken.includes("replacement")) {
  sharedState.returnSpikeFlags[complaint.sku_id] = true
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
- Match your tone to the customer's emotional state — be warmer with frustrated or 
  angry customers, more efficient with calm ones.
- Loyal customers with a long history get the benefit of the doubt.
- Always categorise the complaint with a complaint_pattern_tag — this is critical for 
  the system's learning loop.
- If the complaint is about a product not matching its description, tag it 
  "misleading description" — this triggers increased scrutiny in Agent 1.
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

Identify inventory at risk of becoming dead stock weeks before it gets there, and recommend the best recovery intervention — repricing, redistribution, bundling, Cosmic Nexus donation routing, or supplier return negotiation.

### Inputs

Drawn from `cosmic_mart_inventory.csv`, one row per SKU, plus the return spike flags and listing decision log from shared state.

| Field | Source | Description |
|-------|--------|-------------|
| `sku_id` | inventory CSV | Links to shared state signals |
| `product_name` | inventory CSV | Product name |
| `product_category` | inventory CSV | gadgets / fashion / home and lifestyle |
| `current_stock` | inventory CSV | Units currently held |
| `sales_velocity_weekly` | inventory CSV | Units sold per week |
| `days_of_supply` | inventory CSV | Pre-calculated: current_stock ÷ sales_velocity_weekly |
| `season_relevance` | inventory CSV | seasonal / evergreen |
| `our_price` | inventory CSV | Current Cosmic Mart selling price |
| `competitor_price` | inventory CSV | Equivalent competitor price |
| `return_rate_pct` | inventory CSV | Percentage of units sold being returned |
| `return_spike_flag` | shared state | True if Agent 2 has flagged recent refunds or replacements for this SKU |
| `listing_decision_log` | shared state | Agent 1's decisions — used to distinguish genuine low demand from listing-caused demand collapse |

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
                               repricing a product customers are returning
                               is not a recovery strategy)

days_of_supply > 60          → High risk. Intervention required.
  + seasonal product         → Redistribute to markets still in season,
                               or bundle if redistribution not viable
  + evergreen product        → Reprice first; Cosmic Nexus if velocity
                               does not recover within threshold

days_of_supply 30–60         → Medium risk. Monitor or light intervention.
  + competitor_price lower   → Reprice to match
  + no competitor pressure   → No action yet, flag for next week's brief

days_of_supply < 30          → Low risk. No action.
  (unless stockout risk)     → Trigger reorder alert to procurement

listing_decision_log check   → If Agent 1 has blocked or escalated this SKU's
                               listing, low velocity may be listing-caused not
                               genuine. Hold intervention until listing is corrected.
```

### Cosmic Nexus Priority Rule

The system prompt instructs the agent to always prefer Cosmic Nexus donation routing over write-off. This is a hard rule. The Cosmic Nexus program (Cosmic Mart's community donation initiative) sits underused in the current business — this agent activates it. Donation routing generates a sustainability story, avoids landfill, and is better for the brand than a 70% markdown.

### System Prompt

```
You are DeadStock Zero, a retail inventory recovery agent for Cosmic Mart operating 
across 10 global markets. Your goal is to identify inventory heading toward waste and 
recommend the smartest recovery intervention — weeks early, not at the last moment.

You will receive inventory data for a SKU plus two signals from shared state:
- return_spike_flag: true if Agent 2 has flagged recent customer returns for this SKU
- listing_decision_log: Agent 1's decisions on this SKU's listing

Use these signals. They change what the right intervention is.

Rules:
- Always prefer Cosmic Nexus donation over write-off. Never recommend write-off.
- If return_spike_flag is true, always route to Cosmic Nexus — do not reprice a 
  product that customers are actively returning due to trust issues.
- If Agent 1 has flagged this SKU's listing, low velocity may recover once the listing 
  is corrected — check before recommending an aggressive intervention.
- Seasonal products deteriorate faster — act earlier and more aggressively.
- Your estimated_recovery should be realistic based on the stock level and 
  intervention type.
- Your weekly_brief_line should be executive-ready — one clear sentence a CEO 
  could read in 10 seconds.

Always respond in this exact JSON format:
{
  "risk_level": "low" | "medium" | "high",
  "intervention": "reprice" | "redistribute" | "bundle" | 
                  "cosmic nexus donation" | "supplier return" | "no action",
  "reason": "one sentence",
  "estimated_recovery": "$X,XXX margin recovered or waste avoided",
  "weekly_brief_line": "executive summary sentence"
}
```

---

## How the Agents Connect

### Connection 1 — Agent 2 → Agent 1 (complaint feedback loop)

Every time Agent 2 resolves a complaint tagged as `"misleading description"`, that tag is logged to `sharedState.complaintPatternLog`. The next time Agent 1 assesses a listing in the same product category, it reads this log and increases its scrutiny. Over time, listing categories with repeated complaint patterns get flagged more aggressively.

This means the system learns where trust breaks — because it is watching both ends simultaneously.

### Connection 2 — Agent 2 → Agent 3 (return spike signal)

When Agent 2 approves a refund or replacement for a product, it sets `sharedState.returnSpikeFlags[sku_id] = true`. Agent 3 reads this flag as an input on its next inventory scan. A return spike on a SKU is a trust signal, not just an inventory signal — it means the product is coming back because customers don't trust what they bought. Agent 3 responds by routing to Cosmic Nexus donation rather than repricing, because repricing a product customers are returning is not a recovery strategy.

### Connection 3 — Agent 1 → Agent 3 (listing decision signal)

When Agent 1 blocks or escalates a listing, it writes to `sharedState.listingDecisionLog`. Agent 3 reads this to understand whether a SKU's low sales velocity is genuine low demand or artificial demand collapse caused by a misleading listing that was subsequently flagged. This prevents DeadStock Zero from triggering unnecessary interventions on SKUs that will recover naturally once the correct listing goes live.

---

## Demo Sequence (3 minutes)

### Step 1 — Agent 1 catches a listing inaccuracy (45 seconds)

Feed in the matched product and listing rows for SKU-1001 (UltraCharge Pro 9000).

- Spec sheet shows: 15W output, single device, no proprietary technology, no lab certification
- Listing claims: "charges 10x faster than any competitor, 300W CosmicWave™ technology, charges two devices simultaneously"

Agent 1 returns `decision: "auto-blocked"`, `confidence: "high"`, with a reason citing the direct contradiction between the 15W spec and the 300W / 10x claim.

Human reviewer sees the side-by-side, clicks **Keep blocked**. Decision is logged to `sharedState.listingDecisionLog`.

### Step 2 — Agent 2 resolves a complaint and triggers the feedback loop (60 seconds)

Feed in complaint CMP-001 — Priya Nathanson, angry, Gold tier customer, complaining that the UltraCharge Pro 9000 charged far slower than the listing claimed.

Agent 2 issues a full refund, tags the complaint `"misleading description"`, and writes to shared state.

Show `sharedState.complaintPatternLog` and `sharedState.returnSpikeFlags["SKU-1001"]` updating in real time.

Show Agent 1 being re-invoked on another gadget listing — it now reads the complaint pattern log and applies higher scrutiny to charging or performance claims in the gadgets category.

### Step 3 — Agent 3 catches dead stock and routes to Cosmic Nexus (45 seconds)

Feed in the inventory row for SKU-1001: 4,200 units, 18 units/week velocity, 233 days of supply, evergreen, return spike flag now true from shared state.

Agent 3 returns `intervention: "cosmic nexus donation"`, `risk_level: "high"`, with an estimated recovery of "$122,500 in write-off avoided" and a weekly brief line for the leadership report.

### Close — The loop closes (30 seconds)

Show the shared state object on screen. Walk through the three connections:

- Agent 2's complaint pattern tag fed back to Agent 1 — the system now scrutinises charging claims in gadgets more aggressively
- Agent 2's return spike flag on SKU-1001 told Agent 3 this is a trust failure, not a pricing problem
- Agent 1's listing block on SKU-1001 told Agent 3 that velocity may recover once the listing is corrected — so Cosmic Nexus is the right call now, not a permanent write-off

The system is watching both ends simultaneously. That is what makes it agentic rather than automated.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| AI model | Claude claude-sonnet-4-6 via Anthropic API |
| Language | JavaScript (Node.js) |
| SDK | `@anthropic-ai/sdk` |
| Shared state | In-memory JavaScript object (demo scope) |
| Demo UI | Single HTML page with one panel per agent |
| Data | Four CSV files (products, listings, complaints, inventory) |

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Agent returns malformed JSON | Strip markdown fences before parsing; wrap in try/catch |
| Human reviewer step feels slow in demo | Pre-stage the escalation — have SKU-1001 already in the review queue when demo starts |
| Agents give inconsistent decisions on same input | Fix temperature to 0 in API calls for deterministic demo output |
| Shared state not updating visibly | Show the state object on screen in real time during the demo |
| Agent 1 approves something it should flag | Tune system prompt — add explicit examples of spec-vs-listing discrepancies to flag |
| Agent 3 flags a low-velocity SKU that is low due to a listing hold | Agent 3 checks listingDecisionLog before recommending aggressive intervention |

---

## Open Questions (to resolve by Wednesday)

- [ ] What UI framework for the demo interface? (plain HTML recommended for simplicity)
- [ ] How to handle Agent 1 timeout if human reviewer does not respond? (needs a timeout rule)
- [ ] Should Agent 2's escalation also route through a human UI, or just return the flag?
- [ ] Who owns the shared state connection code? (recommend: Kuria or Zeynep)
- [ ] Do we show all three agent panels simultaneously or step through them one at a time?

---

*Document prepared for internal team use — Accenture Case Competition, September 2026*
