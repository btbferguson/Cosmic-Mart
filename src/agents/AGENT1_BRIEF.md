# Agent 1 — Fact Checker

**Pair A.** Branch `Agent-1`. Read [`/AGENTS.md`](../../AGENTS.md) first.

Files you own:
```
src/agents/agent1_factchecker.js
src/prompts/prompt_agent1.js
fixtures/agent1/
```

---

## What it does

Intercepts a product listing before it goes live and assesses every claim in it
for accuracy, compliance and honesty. Clears it, escalates it to a human, or
blocks it.

**It never has the final word on a listing it is unhappy with.** It flags,
explains and recommends. A person decides. This is a hard rule, not a
preference — it is also the best answer we have to the Responsible AI question
in Q&A, so do not trade it away for a smoother demo.

Why it matters: Cosmic Mart's own sentiment analysis names *false advertising*
as a driver of negative brand chatter (business case p.41). This agent is the
direct answer to that.

---

## Input

One listing object:

| Field | Type | Notes |
|---|---|---|
| `product_name` | string | |
| `product_description` | string | the factual detail claims get checked against |
| `claims` | string | promotional copy — this is what you are assessing |
| `market_region` | string | one of Cosmic Mart's 10 markets; compliance varies |
| `product_category` | string | `gadgets` \| `fashion` \| `home and lifestyle` |
| `sku_id` | string | for the audit log |

Plus recent complaint patterns for that category, which you read from shared
state — not from the caller.

## Output

```json
{
  "decision": "approved" | "escalate" | "auto-blocked",
  "confidence": "high" | "medium" | "low",
  "reason": "one sentence",
  "recommendation_to_reviewer": "only when escalating, else empty string",
  "complaint_signal": "short category tag"
}
```

- `approved` — claim is supportable from the description provided, nothing in the
  complaint log applies. Goes live, no human involved.
- `escalate` — you have a concern but are not certain. Human reviews first.
  `recommendation_to_reviewer` must tell them exactly what to look at.
- `auto-blocked` — obvious violation: illegal health or medical claim, a
  demonstrably false statistic, or a direct match to a known complaint pattern.
  Held immediately; a human is notified but the hold does not wait for them.

When uncertain, escalate. Never approve.

---

## Shared state

**Read** — before you build the prompt:
```js
import { complaintPatternsFor } from '../state.js';
const patterns = complaintPatternsFor(listing.product_category);
```
Feed these into the prompt. If a claim matches a recent complaint pattern in the
same category, lean hard toward escalation. This is Agent 2 teaching you where
trust already broke.

**Write** — after you validate the result:
```js
import { logListingDecision, enqueueForReview } from '../state.js';
```
- `logListingDecision(...)` on every assessment. Audit trail, and it tells Agent 3
  whether a SKU's weak sales are real or a listing we pulled.
- `enqueueForReview(...)` on `escalate` and `auto-blocked`. This is the human's
  inbox and it drives the reviewer UI.

---

## Done when

- [ ] Runs from a harness against a listing object and returns contract-valid JSON
- [ ] `validate('agent1', AGENT1_OUTPUT, result)` passes
- [ ] Correctly separates a clean listing, a borderline one, and an obvious
      violation — all three paths demonstrated
- [ ] Escalations always populate `recommendation_to_reviewer`
- [ ] Reads `complaintPatternsFor` and visibly gets stricter when a matching
      pattern exists
- [ ] Writes `logListingDecision` every time, `enqueueForReview` when not approved
- [ ] Fixtures recorded into `fixtures/agent1/`

---

## Not yours

The reviewer UI, the server, the shared state module, the other two agents.
Do not edit `src/contracts.js`, `src/state.js` or `src/llm.js`.
