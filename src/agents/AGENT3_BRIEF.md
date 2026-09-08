# Agent 3 — DeadStock Zero

**Pair C.** Branch `Agent-3`. Read [`/AGENTS.md`](../../AGENTS.md) first.

Files you own:
```
src/agents/agent3_deadstock.js
src/prompts/prompt_agent3.js
fixtures/agent3/
```

---

## What it does

Spots inventory heading toward dead stock weeks before it gets there, and picks
the best recovery move — reprice, redistribute, bundle, route to Cosmic Nexus
donation, or return to supplier.

Why it matters: the Cosmic Nexus donation programme already exists at Cosmic Mart
(business case p.6) and sits unused. This agent activates it. Donation beats a
70% markdown on brand, on sustainability and on landfill — and sustainability is
one of the four strategic priorities.

---

## Input

| Field | Type | Notes |
|---|---|---|
| `sku_id`, `sku_name`, `sku_description` | string | |
| `current_stock` | number | units on hand |
| `sales_velocity` | number | units per week |
| `days_of_supply` | number | current_stock / sales_velocity * 7 |
| `season_relevance` | seasonal / evergreen | seasonal decays faster, act earlier |
| `competitor_price` | number | optional |
| `market_region` | string | redistribution depends on it |

Plus `return_spike_flag`, which you read from shared state — not from the caller.

## Output

```json
{
  "risk_level": "low" | "medium" | "high",
  "intervention": "reprice" | "redistribute" | "bundle" | "cosmic nexus donation" | "supplier return" | "no action",
  "reason": "one sentence",
  "estimated_recovery": "$X,XXX margin recovered / waste avoided",
  "weekly_brief_line": "executive summary sentence"
}
```

`weekly_brief_line` should be one sentence a CEO reads in ten seconds. Write it
for Riley Lopez, who the case describes as demanding, detail-focused and
sceptical of consultants.

**Never recommend write-off.** Cosmic Nexus donation is always preferred. Hard rule.

---

## Let the model decide, then check it

The architecture doc lists intervention rules by days of supply and season.
**Do not implement those rules as the decision-maker.** If an if-statement picks
the intervention, the model is decoration, and a judge scoring technical accuracy
will notice.

Build it the other way round:

1. The model reasons over the inputs and chooses an intervention.
2. A validator checks that choice against the non-negotiables and can veto:
   - `return_spike_flag === true` must route to Cosmic Nexus. You do not discount
     a product customers are actively sending back — that is a trust problem, not
     a pricing problem.
   - The intervention must be one of the six allowed values.
   - Write-off is never acceptable.

That split — model reasons, code guards — is worth saying out loud in the pitch.

`no action` is a legitimate and often correct answer. An agent that intervenes on
everything is not smart, it is expensive.

---

## Shared state

**Read** — before you build the prompt:

```js
import { hasReturnSpike, sharedState } from '../state.js';
```

- `hasReturnSpike(sku_id)` — Agent 2 telling you this SKU is coming back.
- `sharedState.listingDecisionLog` — Agent 1 telling you whether weak sales are
  genuine low demand or a listing that got pulled. Do not intervene on a SKU that
  will recover once a corrected listing goes live.

**Write** — nothing. You are the end of the chain. Return your result and let the
UI render it.

---

## Done when

- [ ] Triages a SKU and returns contract-valid JSON
- [ ] The model chooses the intervention; code only validates and can veto
- [ ] A return spike always produces Cosmic Nexus, proven with a test
- [ ] Never returns write-off
- [ ] Returns `no action` on a healthy SKU rather than intervening for its own sake
- [ ] Reads `hasReturnSpike` and `listingDecisionLog` from shared state
- [ ] `weekly_brief_line` reads like something a CEO would actually be sent
- [ ] Fixtures recorded into `fixtures/agent3/`

---

## Not yours

The UI, the server, the shared state module, the other two agents.
Do not edit `src/contracts.js`, `src/state.js` or `src/llm.js`.
