# Customer Chat UI → Agent 2

Customer-facing chat box for the CosmicTrust demo, wired to **Agent 2 (Customer Resolution)** with two lightweight sub-agents in front and a human approval gate in the middle.

Branch: `customer-ui`.

---

## Summary

A customer types into a chat box. Every message is classified as a **question** or a **complaint**:

- **Question** → answered directly by a Q&A sub-agent. No human, no Agent 2 tool budget spent.
- **Complaint** → does **not** auto-run Agent 2. It lands in the existing employee portal's **CosmicCare / Customer Service** queue, where a human approves the complaint tag first. On approval, Agent 2 runs and its `response_to_customer` streams back into the waiting customer's chat live.

The human gate is enforced **in code** (per `AGENTS.md`): `resolve()` (Agent 2) is only ever called inside the `approved` branch of the review endpoint — never from the chat endpoint.

```
customer message ─▶ classifier ─▶ question ─▶ Q&A reply ─────────────────▶ chat
                               └▶ complaint ─▶ review queue ─▶ [HUMAN APPROVES]
                                                                    ├▶ approved ─▶ Agent 2 ─▶ reply ─▶ chat (live via SSE)
                                                                    └▶ rejected ─▶ "specialist will follow up" ─▶ chat
```

---

## Files created

| File | Purpose |
|---|---|
| `server.js` | Express 5 + SSE server. Endpoints: `GET /` (portal), `GET /customer` (chat), `GET /api/customers`, `GET /api/complaints`, `GET /api/events` (SSE), `POST /api/chat`, `POST /api/review/:id/resolve`. Holds the demo-customer roster and the live SSE connection map. Enforces the human gate. |
| `src/customer/classifier.js` | `classify(message)` → `{ type: 'question'\|'complaint', predicted_tag, reason }`. Via `src/llm.js` (`callJSON`), temperature 0. Tags kept identical to Agent 2's six. |
| `src/customer/qa.js` | `answer(message, customer)` → `{ response }`. Answers product/store questions; never promises refunds/replacements/fee waivers. |
| `ui/customer.html` | Standalone customer chat page. Demo-customer dropdown (CMP-001/002/007/017), chat transcript, live "Reviewing your complaint…" state resolved via `EventSource`. Plain HTML/CSS/JS, no framework. |
| `customer-ui.md` | This document. |

## Files edited

| File | Change |
|---|---|
| `ui/index.html` | Made the **CosmicCare Complaint Center** live. Added a live-complaint layer (`liveComplaints` map, `ccData()`, `cardToItem()`, `openLiveComplaintDetail()`, `approveLive()`, `rejectLive()`) and an `EventSource` connection that seeds from `/api/complaints` and reacts to `complaintQueued` / `complaintResolved`. Redirected the three `mockComplaints` read sites to `ccData()`. Pending complaints show an Approve/Reject gate (Agent 2 hasn't run yet); on approval the AI resolution appears in-card. TrustGate, DeadStock, and Admin views untouched. |
| `package.json` | Added `"start": "node --env-file-if-exists=.env server.js"`. |

## Files reused (not modified)

- `src/agents/agent2_resolution.js` — `resolve(complaint)` and `loadComplaints()`.
- `src/state.js` — `enqueueForReview()` and `resolveReview()` (shared state stays truthful).
- `src/llm.js` — `callJSON` (all Claude access goes through here).

---

## Endpoints

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/` | — | Employee portal (`ui/index.html`) |
| GET | `/customer` | — | Customer chat (`ui/customer.html`) |
| GET | `/api/customers` | — | Demo-customer roster (id, name, product, order, tone, seeded_message) |
| GET | `/api/complaints` | — | Current review cards (for portal seed) |
| GET | `/api/events` | `?sessionId=` | SSE stream |
| POST | `/api/chat` | `{ sessionId, customerId, message }` | `{ type:'question', response }` or `{ type:'complaint', reviewId, status }` |
| POST | `/api/review/:id/resolve` | `{ verdict:'approved'\|'rejected' }` | `{ ok, verdict, resolution? }` |

SSE message types: `complaintQueued` (portal), `complaintResolved` (portal), `chatResolution` (targeted to the waiting customer session).

---

## How to run

```bash
npm start   # http://localhost:3000  (customer chat → /customer, portal → /)
```

Requires `ANTHROPIC_API_KEY` in `.env`. If you're on a Vocareum key, also set `COSMIC_ANTHROPIC_BASE_URL=https://claude.vocareum.com` — see `AGENTS.md` for why.

---

## Pre-push checklist (per AGENTS.md)

```bash
npm run check   # Node, deps, keys, and endpoints resolve
npm test        # all offline tests pass
```

---

## Verification (done, live API)

1. Question (CMP-017): "Are spare lens covers sold separately?" → direct Q&A reply, no queue card.
2. Complaint (CMP-001): false-advertising message → queued `REV-1`, pending; card appears in CosmicCare.
3. Approve in CosmicCare → Agent 2 ran (consulted Agent 1 + Agent 3 via the registry), issued a refund, returned the customer message; card flipped to `resolved`.
4. Reject → customer gets a follow-up ack; Agent 2 never runs.

---

## Open items / caveats

- **Replay mode**: the new `classifier` and `qa` sub-agents have **no fixtures yet**. For a wifi-proof stage demo, record them (`COSMIC_LLM_MODE=record`) against the exact demo inputs, and use each customer's **seeded** complaint text so Agent 2's existing fixtures match (fixtures are keyed by a hash of the exact prompt).
- **Ownership**: `src/customer/`, the `start` script, and the CosmicCare edits in `ui/index.html` are all Integration territory. Per `AGENTS.md`, worth a heads-up in the team channel since `ui/index.html` is shared surface.
- **No new dependencies** (Express was already in `package.json`). Temperature stays 0. Shared files (`src/llm.js`, `src/state.js`, `src/contracts.js`) and Agent 2's files were not modified.
