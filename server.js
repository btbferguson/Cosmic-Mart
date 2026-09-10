/**
 * CosmicTrust demo server.
 *
 * Wires the customer chat to Agent 2 with a human gate in between:
 *
 *   customer message ─▶ classifier ─▶ question ─▶ Q&A reply
 *                                  └▶ complaint ─▶ review queue ─▶ [HUMAN APPROVES]
 *                                                                       └▶ Agent 2 ─▶ reply
 *
 * The human gate is enforced HERE, in code: resolve() (Agent 2) is only ever
 * called inside the 'approved' branch of /api/review/:id/resolve. Per AGENTS.md,
 * a guardrail lives in the function, not only in a prompt.
 *
 * All Claude access still goes through src/llm.js (via the sub-agents and
 * Agent 2). This file adds no LLM calls of its own and no new dependencies —
 * express is already in package.json.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classify } from './src/customer/classifier.js';
import { answer } from './src/customer/qa.js';
import { resolve, loadComplaints } from './src/agents/agent2_resolution.js';
import { enqueueForReview, resolveReview } from './src/state.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(ROOT, 'ui');
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ *
 * Demo customer roster
 *
 * Sourced from the seeded complaints CSV so replay-mode fixtures match, and
 * augmented with order_value (which the CSV does not carry). These four cover
 * both demo paths: CMP-017 is a genuine question, the rest are complaints.
 * ------------------------------------------------------------------ */

const DEMO_IDS = ['CMP-001', 'CMP-002', 'CMP-007', 'CMP-017'];
const ORDER_VALUES = { 'CMP-001': 299, 'CMP-002': 149, 'CMP-007': 89, 'CMP-017': 45 };

const allComplaints = loadComplaints();
const DEMO_CUSTOMERS = DEMO_IDS.map((id) => {
  const row = allComplaints.find((c) => c.complaint_id === id);
  return { ...row, order_value: ORDER_VALUES[id] ?? 99 };
}).filter((c) => c.complaint_id);

/* ------------------------------------------------------------------ *
 * Server-side session state (not the shared agent state)
 *   - sseClients: live browser connections, keyed by sessionId
 *   - complaints: everything the portal needs to render a review card
 * ------------------------------------------------------------------ */

const sseClients = new Map(); // sessionId -> res
const complaints = new Map(); // reviewId -> card

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients.values()) res.write(data);
}

function sendTo(sessionId, payload) {
  const res = sseClients.get(sessionId);
  if (res) res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.sendFile(path.join(UI_DIR, 'index.html')));
app.get('/customer', (_req, res) => res.sendFile(path.join(UI_DIR, 'customer.html')));
app.use(express.static(UI_DIR));

/** Demo customer roster for the chat dropdown (safe subset). */
app.get('/api/customers', (_req, res) => {
  res.json(
    DEMO_CUSTOMERS.map((c) => ({
      complaint_id: c.complaint_id,
      customer_name: c.customer_name,
      product_name: c.product_name,
      order_id: c.order_id,
      emotional_tone: c.emotional_tone,
      seeded_message: c.complaint_description, // pre-fill for replay-safe demos
    })),
  );
});

/** Current review cards, so the portal can seed its queue on load. */
app.get('/api/complaints', (_req, res) => {
  res.json([...complaints.values()]);
});

/** SSE stream. One connection per browser session. */
app.get('/api/events', (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).end('sessionId required');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  sseClients.set(sessionId, res);
  req.on('close', () => {
    if (sseClients.get(sessionId) === res) sseClients.delete(sessionId);
  });
});

/**
 * A customer message. Classify, then either answer it or queue it for review.
 * Agent 2 is deliberately NOT called here — a complaint only reaches it after a
 * human approves it in /api/review/:id/resolve.
 */
app.post('/api/chat', async (req, res) => {
  const { sessionId, customerId, message } = req.body ?? {};
  if (!message || !customerId) {
    return res.status(400).json({ error: 'customerId and message are required' });
  }

  const customer = DEMO_CUSTOMERS.find((c) => c.complaint_id === customerId);
  if (!customer) return res.status(404).json({ error: `Unknown customer ${customerId}` });

  let classification;
  try {
    classification = await classify(message);
  } catch (err) {
    return res.status(502).json({ error: `Classifier failed: ${err.message}` });
  }

  if (classification.type === 'question') {
    try {
      const { response } = await answer(message, customer);
      return res.json({ type: 'question', response });
    } catch (err) {
      return res.status(502).json({ error: `Q&A failed: ${err.message}` });
    }
  }

  // Complaint → shared review queue + portal card. Waits for a human.
  const review = enqueueForReview({
    kind: 'complaint',
    sessionId,
    complaint_id: customer.complaint_id,
    customer_name: customer.customer_name,
    order_id: customer.order_id,
    sku_id: customer.sku_id,
    product_name: customer.product_name,
    complaint_description: message,
    customer_history: customer.customer_history,
    emotional_tone: customer.emotional_tone,
    predicted_tag: classification.predicted_tag,
  });

  const card = {
    reviewId: review.id,
    sessionId,
    customer_name: customer.customer_name,
    order_id: customer.order_id,
    sku_id: customer.sku_id,
    product_name: customer.product_name,
    complaint_description: message,
    customer_history: customer.customer_history,
    emotional_tone: customer.emotional_tone,
    predicted_tag: classification.predicted_tag,
    status: 'pending',
    received: new Date().toISOString(),
  };
  complaints.set(review.id, card);
  broadcast({ type: 'complaintQueued', card });

  res.json({ type: 'complaint', reviewId: review.id, status: 'pending' });
});

/**
 * The human verdict on a queued complaint.
 *   approved → Agent 2 resolves it now, and the customer gets the reply live.
 *   rejected → the customer gets a follow-up ack; Agent 2 never runs.
 */
app.post('/api/review/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const verdict = req.body?.verdict;
  const card = complaints.get(id);
  if (!card) return res.status(404).json({ error: `Unknown review ${id}` });
  if (card.status !== 'pending') {
    return res.status(409).json({ error: `Review ${id} already ${card.status}` });
  }

  if (verdict === 'rejected') {
    card.status = 'rejected';
    resolveReview(id, 'rejected');
    const ack = `Thanks ${card.customer_name} — we've logged your message and a specialist will follow up with you shortly.`;
    broadcast({ type: 'complaintResolved', reviewId: id, verdict: 'rejected', card });
    sendTo(card.sessionId, { type: 'chatResolution', reviewId: id, verdict: 'rejected', response: ack });
    return res.json({ ok: true, verdict: 'rejected' });
  }

  if (verdict !== 'approved') {
    return res.status(400).json({ error: "verdict must be 'approved' or 'rejected'" });
  }

  // Approved: Agent 2 runs. This is the only place resolve() is called.
  const customer = DEMO_CUSTOMERS.find((c) => c.complaint_id === card.complaint_id) ?? {};
  const complaint = {
    complaint_id: card.complaint_id,
    customer_name: card.customer_name,
    order_id: card.order_id,
    sku_id: card.sku_id,
    product_name: card.product_name,
    complaint_description: card.complaint_description,
    customer_history: card.customer_history,
    emotional_tone: card.emotional_tone,
    order_value: customer.order_value ?? 99,
  };

  let resolution;
  try {
    resolution = await resolve(complaint);
  } catch (err) {
    return res.status(502).json({ error: `Agent 2 failed: ${err.message}` });
  }

  card.status = 'resolved';
  card.resolution = resolution;
  resolveReview(id, 'approved');

  broadcast({ type: 'complaintResolved', reviewId: id, verdict: 'approved', card, resolution });
  sendTo(card.sessionId, {
    type: 'chatResolution',
    reviewId: id,
    verdict: 'approved',
    response: resolution.response_to_customer,
  });

  res.json({ ok: true, verdict: 'approved', resolution });
});

app.listen(PORT, () => {
  console.log(`CosmicTrust demo on http://localhost:${PORT}`);
  console.log(`  customer chat → http://localhost:${PORT}/customer`);
  console.log(`  employee portal → http://localhost:${PORT}/`);
  console.log(`  LLM mode: ${process.env.COSMIC_LLM_MODE || 'live'}`);
});
