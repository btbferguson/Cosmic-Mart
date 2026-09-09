# CosmicTrust

Three agentic AI systems that make each other better, built for the **APEX
Hackathon FY27 Cohort 1** Cosmic Mart case. Team 06, Eastern Edge.
Showcase: **Friday 11 September, 12:25pm ET**.

| Agent | Job | Model |
|---|---|---|
| **1 · Fact Checker** | Catches misleading product claims before a listing goes live | Anthropic |
| **2 · Customer Resolution** | Resolves complaints with real authority — refunds, replacements, fee waivers | Anthropic |
| **3 · DeadStock Zero** | Recovers inventory heading for waste, routed to Cosmic Nexus donation | OpenRouter |

The point is not three agents. The point is that they **feed each other**:

```
Agent 2 ──► Agent 1     complaint patterns raise Agent 1's scrutiny
Agent 2 ──► Agent 3     a return spike forces donation over a discount
Agent 1 ──► Agent 3     listing decisions distinguish real weak demand
Agent 3 ──► Agent 2     "this stock is leaving — stop offering replacements"
```

Run `npm run demo` to watch all four fire in one session.

Design lives in [`CosmicTrust_Architecture.md`](CosmicTrust_Architecture.md).
Working rules for contributors are in [`AGENTS.md`](AGENTS.md).

---

## Setup

Five minutes. Do all of it before writing any code.

### 1. Install Node

You need **Node 20.12 or newer**; Node 22 LTS is the safe choice.

```bash
node --version
```

If that errors or prints below `v20.12.0`, install from
[nodejs.org](https://nodejs.org) and **reopen your terminal** — that's the most
common reason a fresh install "didn't work".

### 2. Clone and install

```bash
git clone https://github.com/btbferguson/Cosmic-Mart.git
cd Cosmic-Mart
npm ci
```

Use `npm ci`, **not** `npm install`. `ci` installs the exact versions in
`package-lock.json`, so all six of us get identical dependencies. `npm install`
is free to pick up newer versions and drift your machine away from everyone
else's. This is how we stay in sync without containers.

### 3. Set up your keys

Each person uses **their own** keys, and they never go in git.

```bash
cp .env.example .env
```

Windows PowerShell:

```bash
Copy-Item .env.example .env
```

Then open `.env` and fill in **both** providers. You need both to run the full
system — Agents 1 and 2 are on Anthropic, Agent 3 is on OpenRouter.

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Your Udacity/Vocareum `voc-` key, or a direct `sk-ant-` key |
| `COSMIC_ANTHROPIC_BASE_URL` | `https://claude.vocareum.com` for `voc-` keys. Comment out for `sk-ant-` |
| `OPENROUTER_API_KEY` | From [openrouter.ai/keys](https://openrouter.ai/keys) |

Everything else in `.env.example` has a working default. Each variable is
documented in that file — read the comments before changing one.

**Two gotchas that will cost you an hour if nobody tells you:**

1. **Use `COSMIC_ANTHROPIC_BASE_URL`, not `ANTHROPIC_BASE_URL`.** Some machines
   have `ANTHROPIC_BASE_URL` set globally pointing at `api.anthropic.com`, and
   Node's `--env-file` does **not** overwrite variables that already exist in
   the environment. Your `.env` gets silently ignored and you get a 401
   "invalid x-api-key" that looks like a bad key.
2. **A `voc-` key only works against `https://claude.vocareum.com`.** Vocareum
   keys are rejected outright by Anthropic's own API.

`npm run check` catches both.

### 4. Verify

```bash
npm run check
```

Checks your Node version, dependencies, `.env`, both keys, the endpoints they
point at, and that `.env` is gitignored. Everything should say `OK`; any `FAIL`
line tells you the fix.

```bash
npm test
```

63 tests, no keys, no network. All should pass.

```bash
npm run ping
```

One real Anthropic call, to prove your key and endpoint work together.

---

## Running it

### The whole system

```bash
npm run demo
```

Three rounds, all four connections, roughly three minutes. This is the demo.

- **Round 1** — Agent 1 assesses a listing, Agent 2 resolves a complaint about
  that same product, Agent 3 triages the inventory reading both signals.
- **Round 2** — the feedback flows backwards. Agent 3's advisory tells Agent 2
  whether replacement stock still exists, and a second complaint accumulates a
  pattern in the same category.
- **Round 3** — Agent 1 re-reads the **identical** listing, now with two
  complaint patterns on record, and typically hardens `escalate` into
  `auto-blocked`. Same input, more evidence.

Point it at other SKUs (both need a complaint on file):

```bash
npm run demo -- --sku SKU-1001 --second SKU-1006
```

### One agent at a time

```bash
npm run agent1
```

Agent 1 across three decision paths — clean, borderline, and an obvious violation.

```bash
npm run agent3 -- --sku SKU-1001
```

Agent 3 on one SKU with the full trace: reasoning, tool calls, agent
consultations, and the decision card.

```bash
npm run agent3 -- --sku SKU-1001,SKU-1028,SKU-1004
```

Several SKUs, full trace on each, with a roll-up. Good three-case demo:
SKU-1001 routes to donation, SKU-1028 correctly declines to (clean returns),
SKU-1004 needs no action at all.

```bash
npm run agent3 -- --all
```

All 50 SKUs, one line each. ~4 minutes, about 1.5 cents.

```bash
npm run agent3 -- --brief
```

Same, plus a weekly leadership roll-up.

```bash
npm run agent3 -- --list
```

Every SKU with its signals. **No model calls, no key needed, instant.**

Add `--verbose` to `--all` or `--brief` for the full trace per SKU, and
`--limit N` to cap it. A curated 20 is a good regression check:

```bash
npm run agent3 -- --all --verbose --limit 20
```

---

## Tests

```bash
npm test
```

63 tests, no API key, no network, about a second. They cover the deterministic
half of the system — everything that must be right whether or not a model
behaves.

| File | What it proves |
|---|---|
| `tests/interaction.test.js` | All four agent-to-agent connections, the call graph, depth and cycle limits |
| `tests/agent3.test.js` | CSV parsing, the `sku_id` joins, data arithmetic, guardrails |
| `tests/agent2/agent2.test.js` | Agent 2's authority limits and escalation rules |
| `tests/env.test.js` | JSON extraction, contract validation, shared-state plumbing |

Run one file:

```bash
node --test tests/interaction.test.js
```

New tests go in `tests/`. `npm test` picks them up automatically.

---

## Commands

| Command | What it does |
|---|---|
| `npm run check` | Verify Node, deps, keys and endpoints |
| `npm test` | 63 offline tests |
| `npm run ping` | One real Anthropic call |
| `npm run demo` | **All three agents, three rounds, four connections** |
| `npm run agent1` | Agent 1 across three decision paths |
| `npm run agent3 -- --help` | Agent 3's full flag list |

---

## Layout

```
src/
  llm.js            Anthropic client (Agents 1 and 2)
  openrouter.js     OpenRouter client (Agent 3)
  contracts.js      The agreed output shape for each agent
  state.js          Shared state — the five channels agents signal through
  agents/
    registry.js     Each agent wrapped as a tool the others can call
    agent1_factchecker.js  agent2_resolution.js  agent3_deadstock.js
    agent3_tools.js        Agent 3's data lookups
  prompts/          System prompts, kept apart from logic
  tools/            Agent 2's action tools (refund, replacement, fee waiver)
  data/             The four Cosmic Mart CSVs + the loader
harness/
  demo.js           The multi-round orchestrator
  agent3.js         Agent 3 CLI
  render.js         Terminal decision cards, shared by all agents
  check_env.js      npm run check
  ping.js           npm run ping
  seedSignals.js    Stands in for Agents 1 & 2 when running Agent 3 alone
fixtures/           Recorded API responses (gitignored)
tests/              Offline test suites
```

### Files worth understanding first

**`src/state.js`** — the five channels the agents signal through. This object is
the system. Use the exported writer functions rather than mutating
`sharedState` directly, so the UI hears about every change.

**`src/agents/registry.js`** — the agent-as-tool layer, and the call graph in
one readable table. Agent 2 and Agent 3 can each consult the other, so the
graph is cyclic; it terminates because those consultations read published state
instead of re-invoking a model, and because a call stack plus a depth limit
refuse to re-enter an agent already in the chain.

**`src/contracts.js`** — what each agent must return. Code against it; raise a
change in the team channel first, because someone else is building against it.

---

## Offline mode

`COSMIC_LLM_MODE` controls both clients:

| Mode | Behaviour |
|---|---|
| `live` | Calls the API every time. The default. |
| `record` | Calls the API **and** saves each response into `fixtures/`. |
| `replay` | Never calls the API. Serves saved fixtures only — works with no key and no internet. |

Before the showcase, run everything once in `record` mode. If the conference
wifi dies, set `COSMIC_LLM_MODE=replay` and the demo runs identically offline.

Fixtures are gitignored — they are large, and anyone can regenerate them:

```bash
COSMIC_LLM_MODE=record npm run agent3 -- --all
```

PowerShell needs the env var set separately (there is no inline `VAR=value`
prefix):

```bash
$env:COSMIC_LLM_MODE="record"; npm run agent3 -- --all
```

---

## Staying in sync

```bash
git pull
npm ci
```

Run `npm ci` after **every** pull. If someone added a dependency, that's what
gets it onto your machine. It's fast and idempotent.

### When something breaks

In order — the first one fixes most things:

```bash
npm ci
```

```bash
rm -rf node_modules && npm ci
```

PowerShell:

```bash
Remove-Item -Recurse -Force node_modules; npm ci
```

Still broken? Run `npm run check` and paste the output into the team channel —
it usually names the problem outright.

---

## Working agreements

One pair per agent, one file set per pair. See the ownership table in
[`AGENTS.md`](AGENTS.md).

Branches are `Agent-1`, `Agent-2`, `Agent-3` and `UI`. `integration` is where
they merge. **Never commit to `main`** — that's what we demo from.

Never commit `.env`, an API key, or `node_modules/`.

---

## Agent 1 Data

- Cosmic Mart Products
    - All the products and their specs
- Cosmic Mart Listings
    - All the listings with the descriptions and claims

 Here are the incorrect listings that should be flagged:
  - SKU-1001 — listing says 300W and charges two devices simultaneously; spec says 15W, single device only
  - SKU-1006 — listing claims active noise cancellation; spec says passive isolation only, no ANC hardware
  - SKU-1008 — listing says 16 user profiles; spec says 8 maximum
  - SKU-1010 — listing says "clinical-grade" heart rate accuracy; spec says 10–15% variance under movement
  - SKU-1013 — listing says works on glass; spec explicitly excludes highly reflective glass
  - SKU-1023 — listing says moulds overnight; spec says over time with regular wear
  - SKU-1034 — listing says all components dishwasher safe; spec excludes the walnut stand
  - SKU-1044 — listing claims reverses ageing in 2 weeks; no such claim in spec
  - SKU-1050 — listing says scientifically proven for sleep; spec confirms no studies conducted
