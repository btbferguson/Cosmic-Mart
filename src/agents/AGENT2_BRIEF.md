# Agent 2 — Customer Resolution

**Pair B.** Branch `Agent-2`. Read [`/AGENTS.md`](../../AGENTS.md) first.

Files you own:
```
src/agents/agent2_resolution.js
src/prompts/prompt_agent2.js
src/tools/
fixtures/agent2/
```

---

## What it does

Takes a customer complaint and resolves it with a specific, concrete action. No
scripts, no policy quotes, no redirects to a help page. It has real authority —
it can approve refunds, waive fees and dispatch replacements without asking a
human.

Why it matters: unresponsive customer support and a complicated return policy are
two of the four negative sentiment drivers in Cosmic Mart's own analysis
(business case p.41).

**You own the tools.** This is the part of the build that makes the system
agentic rather than a classifier — the agent should not describe a refund, it
should call a function that issues one. Give it real tool definitions
(`issue_refund`, `dispatch_replacement`, `waive_fee`) and let it choose.

---

## Input

Rows come from `cosmic_mart_complaints.csv`. The data loader passes them in as-is.
Two fields from the brief are not in the CSV and need to be handled:

- `product_category` — join from `cosmic_mart_products.csv` on `sku_id` in the
  data loader, or default to `'unknown'` for the demo. Needed for the complaint
  pattern signal.
- `order_value` — not in the CSV. Hard-code a plausible value in the harness for
  demo purposes, or derive it from the complaint text. Needed to enforce the $500
  refund cap.

| Field | Source | Type | Notes |
|---|---|---|---|
| `complaint_id` | complaints CSV | string | for the action ledger |
| `customer_name` | complaints CSV | string | |
| `order_id` | complaints CSV | string | |
| `sku_id` | complaints CSV | string | needed for the return spike signal |
| `product_name` | complaints CSV | string | |
| `complaint_description` | complaints CSV | string | |
| `customer_history` | complaints CSV | string | loyal customers get benefit of the doubt |
| `emotional_tone` | complaints CSV | frustrated / angry / calm | match your tone to it |
| `product_category` | join from products CSV | string | needed for the complaint pattern signal |
| `order_value` | harness / derived | number | decides whether it is inside your authority |

---

## Output

```json
{
  "action_taken": "specific action",
  "response_to_customer": "message to send",
  "complaint_pattern_tag": "category tag",
  "escalate_to_human": true | false
}
```

`complaint_pattern_tag` is the most important field in this agent and the easiest
to treat as an afterthought. It is what teaches Agent 1. Keep tags consistent and
reusable — `misleading description`, `wrong item`, `damaged delivery`,
`product defect`, `late delivery`. A tag used once teaches nothing.

---

## Authority

Resolve without a human:
- Full refund **up to $500**
- Fee waiver, any amount
- Replacement dispatch
- Partial refund or store credit

Escalate to a human:
- Refunds **above $500**
- Legal or regulatory complaints
- Customer threatening legal action
- Repeat complaint from the same customer about the same issue

**Enforce the $500 cap inside the tool function, not in the system prompt.** A
limit that lives only in a prompt is a suggestion. The tool should refuse and
return a reason the agent can act on. Judges will ask what happens when the model
ignores its instructions — "the function rejects it" is the answer you want.

---

## Shared state

You are the source of both feedback loops. Skip these writes and the other two
agents have nothing to react to, which means the demo has no story.

```js
import { logComplaintPattern, flagReturnSpike, recordAction } from '../state.js';
```

- `logComplaintPattern({ complaint_pattern_tag, product_category, sku_id })` after
  every resolution, so **Agent 1** gets stricter on that category.
- `flagReturnSpike(sku_id)` whenever the action is a refund or replacement, so
  **Agent 3** routes to Cosmic Nexus instead of discounting.
- `recordAction(...)` from inside each tool — the ledger that proves the system
  did something real.

You read nothing from shared state. You only write.

---

## Data files for reference

```
src/data/cosmic_mart_complaints.csv   — complaint inputs
src/data/cosmic_mart_products.csv     — join source for product_category
```

Good demo inputs: CMP-001 (Priya, angry Gold tier customer, SKU-1001 charging
speed claim), CMP-002 (Dario, angry, false ANC claim on SKU-1006), CMP-007
(Felix, angry, dishwasher claim on SKU-1034). CMP-017 (Amara, calm, genuine
product question) shows the agent handling a non-complaint correctly.

---

## Done when

- [ ] Resolves a complaint end to end and returns contract-valid JSON
- [ ] `validate('agent2', result)` passes
- [ ] Tools are real functions the model calls, not strings it describes
- [ ] The $500 cap is enforced in code and demonstrably refuses an over-limit refund
- [ ] Escalates correctly on over-limit, legal threat, and repeat complaint
- [ ] Tone visibly differs between an angry customer and a calm one
- [ ] Never tells the customer to contact support, never quotes policy
- [ ] Writes `logComplaintPattern` every time, `flagReturnSpike` on refund or
      replacement, `recordAction` from every tool
- [ ] Fixtures recorded into `fixtures/agent2/`

---

## Not yours

The UI, the server, the shared state module, the other two agents.
Do not edit `src/contracts.js`, `src/state.js` or `src/llm.js`.
