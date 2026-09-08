# CosmicTrust

Agentic AI prototype for the **APEX Hackathon FY27 Cohort 1** — Cosmic Mart case.
Team 06, Eastern Edge. Showcase: **Friday 11 September, 12:25pm ET**.

Design lives in [`CosmicTrust_Architecture.md`](CosmicTrust_Architecture.md).
This README is only about getting your machine ready to build.

---

## Setup

Takes about five minutes. Do all of it before you write any code.

### 1. Install Node

You need **Node 20.12 or newer**. Node 22 LTS is the safe choice.

Check what you have:

```bash
node --version
```

If that errors, or prints anything below `v20.12.0`, install Node 22 LTS from
[nodejs.org](https://nodejs.org). **Close and reopen your terminal afterwards** —
this is the single most common reason "I installed it but it still says the old
version."

### 2. Clone the repo

```bash
git clone https://github.com/btbferguson/Cosmic-Mart.git
cd Cosmic-Mart
```

### 3. Install dependencies

```bash
npm ci
```

Use `npm ci`, **not** `npm install`. `ci` installs the exact versions recorded in
`package-lock.json`, so all six of us end up with byte-identical dependencies.
`npm install` is free to pick up newer versions and quietly drift your machine
away from everyone else's. This is how we keep the same environment without
needing containers.

### 4. Set up your own API key

Every person uses **their own** key. We never share one, and it never goes in git.

Copy the template:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then open `.env` and replace the placeholder with your key from
[console.anthropic.com](https://console.anthropic.com/settings/keys).

`.env` is gitignored. Confirm it before you ever commit:

```bash
git check-ignore .env
```

That should print `.env`. If it prints nothing, **stop and tell the team** — your
key is one `git add .` away from being public.

### 5. Verify

```bash
npm run check
```

Checks your Node version, dependencies, `.env`, key format, and that `.env` is
ignored. Every line should say `OK`. Any `FAIL` line tells you the fix.

Then confirm the key actually works against the live API:

```bash
npm run ping
```

One small real call. If it prints a reply, you're done.

Finally, prove the plumbing is sane:

```bash
npm test
```

Nine tests, no network, no key needed. All should pass.

---

## Staying in sync

Whenever you pull:

```bash
git pull
npm ci
```

Run `npm ci` after **every** pull. If someone added a dependency, this is what
gets it onto your machine. It's fast and it's idempotent — running it when
nothing changed costs you a few seconds and nothing else.

### When something breaks

Try these in order. The first one fixes most things:

```bash
npm ci
```

```bash
rm -rf node_modules && npm ci
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules; npm ci
```

If it's still broken, run `npm run check` and paste the output into the team
channel — it usually names the problem directly.

---

## Commands

| Command | What it does |
|---|---|
| `npm run check` | Verify your environment is set up correctly |
| `npm run ping` | One real API call, to prove your key works |
| `npm test` | Environment smoke tests — no key or network needed |

More will land here as the build team adds the server and agent harnesses.

---

## Layout

```
src/
  llm.js         Shared Claude client. All API calls go through here.
  contracts.js   The agreed input/output shape for each agent.
  state.js       The shared state the three agents read and write.
  agents/        Agent implementations
  prompts/       System prompts, kept separate from logic
  tools/         Functions agents can actually call
  data/          Demo inputs
harness/
  check_env.js   npm run check
  ping.js        npm run ping
fixtures/        Recorded API responses, for running offline
tests/           Smoke tests
ui/              Demo interface
```

### The three files worth understanding before you start

**`src/llm.js`** — the only place we talk to Claude. Temperature is pinned to `0`
so the same input gives the same answer on stage as it did in rehearsal. Don't
import the Anthropic SDK anywhere else.

**`src/contracts.js`** — the agreed shape of each agent's output. This is what
lets three pairs build three agents in parallel without coordinating. Code
against it; if you need a field changed, raise it in the team channel first
because someone else is building against it right now.

**`src/state.js`** — the shared object the agents use to signal each other. Use
the exported writer functions rather than mutating `sharedState` directly, so
the UI hears about every change.

---

## Working agreements

**One pair per agent, one directory per pair.** Only touch your own files and
merge conflicts mostly stop happening.

| Pair | Owns |
|---|---|
| A | `src/agents/agent1_*`, `src/prompts/prompt_agent1.js`, `fixtures/agent1/` |
| B | `src/agents/agent2_*`, `src/prompts/prompt_agent2.js`, `src/tools/`, `fixtures/agent2/` |
| C | `src/agents/agent3_*`, `src/prompts/prompt_agent3.js`, `fixtures/agent3/` |
| Integration | `src/llm.js`, `src/state.js`, `src/contracts.js`, `server.js`, `ui/`, the repo root |

**Branches.** Work on `agent1`, `agent2`, `agent3`. Don't commit to `main`
directly — that's the branch we demo from.

**Never commit** `.env`, an API key, or `node_modules/`.

---

## Offline mode

`COSMIC_LLM_MODE` controls how `src/llm.js` behaves:

| Mode | Behaviour |
|---|---|
| `live` | Calls the API every time. Default, and what you want while building. |
| `record` | Calls the API **and** saves the response into `fixtures/`. |
| `replay` | Never calls the API. Serves saved fixtures only. Works with no key and no internet. |

Before the showcase we run everything once in `record` mode and commit the
fixtures. If the conference wifi dies mid-pitch, we set `COSMIC_LLM_MODE=replay`
and the demo runs identically with no network at all.

It's also handy day to day — if you're out of API credit, `replay` still lets you
work on the UI.

---

# Agent 1 Data

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
