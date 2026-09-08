# AGENTS.md

Instructions for anyone — human or AI coding agent — working in this repo.
Read this before writing code. It is short on purpose.

---

## What this is

CosmicTrust: a three-agent trust system for the Cosmic Mart case.
**APEX Hackathon FY27 Cohort 1, Team 06 Eastern Edge.**

**Demo: Friday 11 September, 12:25pm ET.** Three days.

The deliverable is a demo that survives fifteen minutes in front of judges — not
production software. When you are choosing between "correct" and "working by
Thursday," choose working by Thursday. Design detail lives in
[`CosmicTrust_Architecture.md`](CosmicTrust_Architecture.md).

---

## Hard rules

- **All Claude calls go through `src/llm.js`.** Never import `@anthropic-ai/sdk`
  anywhere else.
- **Never change `temperature` from `0`.** The demo has to give the same answer
  on stage that it gave in rehearsal.
- **`src/llm.js`, `src/state.js` and `src/contracts.js` are shared.** Do not edit
  them. If you need something changed, raise it in the team channel — five other
  people are building against them right now.
- **Write to shared state only through the exported writer functions** in
  `src/state.js`. Never mutate `sharedState` directly, or the UI will not see it.
- **Never add a dependency without asking.** Every new package is lockfile drift
  for five other machines.
- **Never write a real API key into any file.** Never commit `.env`.
- **Never commit to `main`.** That is the branch we demo from. Work on `Agent-1`,
  `Agent-2` or `Agent-3`.
- **Guardrails go in code, not prompts.** A limit stated only in a system prompt
  is a suggestion. Enforce it in the function, then mention it in the prompt too.
- **The human-in-the-loop step is not optional.** Agent 1 never has the final say
  on a listing it is unhappy with. Do not auto-approve to make the demo smoother.

---

## Who owns what

Only touch your own files. This is what stops six people fighting over the same
merge.

| Pair | Owns | Brief |
|---|---|---|
| A | `src/agents/agent1_*`, `src/prompts/prompt_agent1.js`, `fixtures/agent1/` | [`src/agents/AGENT1_BRIEF.md`](src/agents/AGENT1_BRIEF.md) |
| B | `src/agents/agent2_*`, `src/prompts/prompt_agent2.js`, `src/tools/`, `fixtures/agent2/` | [`src/agents/AGENT2_BRIEF.md`](src/agents/AGENT2_BRIEF.md) |
| C | `src/agents/agent3_*`, `src/prompts/prompt_agent3.js`, `fixtures/agent3/` | [`src/agents/AGENT3_BRIEF.md`](src/agents/AGENT3_BRIEF.md) |
| Integration | `src/llm.js`, `src/state.js`, `src/contracts.js`, `server.js`, `ui/`, the repo root | — |

**Start by reading your brief.** It has your inputs, your outputs, the shared
state you touch, and your definition of done.

---

## The output contract

Return exactly these fields. No extras. Invented fields are the most common way
integration breaks, and it breaks silently.

**Agent 1 — Fact Checker**
```json
{
  "decision": "approved" | "escalate" | "auto-blocked",
  "confidence": "high" | "medium" | "low",
  "reason": "one sentence",
  "recommendation_to_reviewer": "only when decision is escalate, else empty string",
  "complaint_signal": "short category tag"
}
```

**Agent 2 — Customer Resolution**
```json
{
  "action_taken": "specific action",
  "response_to_customer": "message to send",
  "complaint_pattern_tag": "category tag",
  "escalate_to_human": true | false
}
```

**Agent 3 — DeadStock Zero**
```json
{
  "risk_level": "low" | "medium" | "high",
  "intervention": "reprice" | "redistribute" | "bundle" | "cosmic nexus donation" | "supplier return" | "no action",
  "reason": "one sentence",
  "estimated_recovery": "$X,XXX margin recovered / waste avoided",
  "weekly_brief_line": "executive summary sentence"
}
```

Validate before returning: `validate('agent1', AGENT1_OUTPUT, result)` from
`src/contracts.js`. It throws a `ContractError` listing everything wrong at once.

---

## How the agents connect

These three signals are the pitch. Three agents answering prompts is a workflow;
three agents changing each other's behaviour is a system. If your agent does not
read and write its signals, the demo has no story.

```
Agent 2 --[complaint pattern]--> Agent 1     get stricter where trust broke
Agent 2 --[return spike]-------> Agent 3     do not discount what customers return
Agent 1 --[listing decision]---> Agent 3     tell real low demand from a pulled listing
```

---

## Stack conventions

These are decided. Do not propose alternatives.

- ESM only, plain `.js`. No TypeScript, no build step, no bundler, no framework.
- Tests use the built-in `node:test`. No Jest, no Vitest.
- Node >= 20.12. Install with `npm ci`, never `npm install`.

---

## Not building this

Out of scope. Do not add them, and do not suggest them:

- Auth, user accounts, databases, deployment config, CI pipelines.
- Docker. The lockfile is our environment standardization — this was decided.
- Retries, queues, or error handling beyond what keeps the demo alive.
- Redis or any persistent store. In-memory shared state is correct at this scope.

---

## Before you push

```bash
npm run check    # environment is sane
npm test         # smoke tests pass
```

New tests go in `tests/`. Setup instructions are in [`README.md`](README.md).
