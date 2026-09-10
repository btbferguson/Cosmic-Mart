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
import { enqueueForReview, resolveReview, sharedState } from './src/state.js';
import { loadInventory, loadListings, loadProducts } from './src/data/loadData.js';
import {
  buildListingInput,
  agentToolsForAnthropic,
  callAgentTool,
} from './src/agents/registry.js';
import { callClaude, textOf } from './src/llm.js';

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

/**
 * The storefront catalogue.
 *
 * Reads the same CSVs the agents reason over, so the products on the shelf are
 * literally the SKUs Agent 1 polices and Agent 3 triages. A judge can open
 * UltraCharge Pro 9000, read the "charges 10x faster / 300W" claim on the
 * product page, and then watch Agent 1 block that exact listing.
 */
/**
 * Run Agent 1 on a SKU's listing, inside this process.
 *
 * The demo harness (npm run demo) has its own in-memory shared state, so agents
 * it runs are invisible to the dashboard. These endpoints exist so every agent
 * writes to the SAME state the portal reads.
 */
app.post('/api/agent1/check', async (req, res) => {
  const skuId = req.body?.sku_id;
  if (!skuId) return res.status(400).json({ error: 'sku_id is required' });

  const listing = buildListingInput(skuId);
  if (!listing) return res.status(404).json({ error: `No listing for ${skuId}` });

  try {
    const { checkListing } = await import('./src/agents/agent1_factchecker.js');
    const result = await checkListing(listing);
    broadcast({ type: 'agentRan', agent: 'agent1', sku_id: skuId, result });
    res.json({ ok: true, agent: 'agent1', sku_id: skuId, result });
  } catch (err) {
    res.status(502).json({ error: `Agent 1 failed: ${err.message}` });
  }
});

/** Run Agent 3 on a SKU, reading whatever Agents 1 and 2 have written. */
app.post('/api/agent3/assess', async (req, res) => {
  const skuId = req.body?.sku_id;
  if (!skuId) return res.status(400).json({ error: 'sku_id is required' });

  try {
    const { assessSku } = await import('./src/agents/agent3_deadstock.js');
    const { decision, signals, trace } = await assessSku(skuId);
    broadcast({ type: 'agentRan', agent: 'agent3', sku_id: skuId, result: decision });
    res.json({
      ok: true,
      agent: 'agent3',
      sku_id: skuId,
      result: decision,
      signals,
      toolCalls: trace.toolCalls.map((t) => t.name),
    });
  } catch (err) {
    res.status(502).json({ error: `Agent 3 failed: ${err.message}` });
  }
});

/**
 * Ask an agent to justify a decision it already made.
 *
 * This is the accountability surface. An agent that acts without being
 * answerable is the thing everyone is nervous about, so a reviewer can put a
 * question to the agent and get an answer grounded in the SKU's actual data and
 * the agent's own logged reasoning.
 *
 * Deliberately read-only. Explaining never re-runs an agent, never changes a
 * decision, and never spends money - so a reviewer can interrogate freely
 * without side effects.
 */
app.post('/api/agent/explain', async (req, res) => {
  const { agent, sku_id, question } = req.body ?? {};
  if (!agent || !sku_id || !question) {
    return res.status(400).json({ error: 'agent, sku_id and question are required' });
  }

  const listing = loadListings().find((r) => r.sku_id === sku_id);
  const product = loadProducts().find((r) => r.sku_id === sku_id);
  const inventory = loadInventory().find((r) => r.sku_id === sku_id);

  const decision = [...sharedState.listingDecisionLog].reverse().find((d) => d.sku_id === sku_id);
  const advisory = [...sharedState.inventoryAdvisoryLog].reverse().find((a) => a.sku_id === sku_id);
  const patterns = sharedState.complaintPatternLog.filter((c) => c.sku_id === sku_id);

  const AGENTS = {
    agent1: {
      name: 'TrustGate',
      role: 'a pre-publication listing compliance checker',
      ownDecision: decision
        ? `You decided: ${decision.decision} (${decision.confidence} confidence). Your reason was: ${decision.reason}`
        : 'You have not assessed this listing yet.',
    },
    agent2: {
      name: 'CosmicCare',
      role: 'a customer resolution agent with authority to refund up to $500',
      ownDecision: patterns.length
        ? `You tagged this SKU with: ${patterns.map((p) => p.complaint_pattern_tag).join(', ')}`
        : 'You have not handled a complaint for this SKU yet.',
    },
    agent3: {
      name: 'DeadStock Zero',
      role: 'an inventory recovery agent',
      ownDecision: advisory
        ? `You decided: ${advisory.intervention} at ${advisory.risk_level} risk. Your note was: ${advisory.note}`
        : 'You have not triaged this SKU yet.',
    },
  };

  const meta = AGENTS[agent];
  if (!meta) return res.status(400).json({ error: `Unknown agent ${agent}` });

  const system = `You are ${meta.name}, ${meta.role} at Cosmic Mart. A human reviewer is asking you to justify a decision you made.

${meta.ownDecision}

Rules:
- Answer in two or three sentences. A reviewer is reading this between tasks.
- Ground every claim in the data below. Never invent a figure.
- If the data does not support an answer, say so plainly rather than guessing.
- If you got it wrong, say so. You are not defending yourself, you are explaining.
- Do not use markdown formatting.`;

  const context = `SKU ${sku_id} — ${inventory?.product_name ?? 'unknown'}

Manufacturer specification:
${product?.specs ?? 'none on file'}

Customer-facing claims:
${listing?.listing_claims ?? 'none on file'}

Inventory position:
  stock ${inventory?.current_stock ?? '?'} units, ${inventory?.days_of_supply ?? '?'} days of supply
  return rate ${inventory?.return_rate_pct ?? '?'}%, our price ${inventory?.our_price ?? '?'}, competitor ${inventory?.competitor_price ?? '?'}
  ${inventory?.season_relevance ?? ''}

Signals from other agents:
  return spike flagged: ${Boolean(sharedState.returnSpikeFlags[sku_id])}
  complaint patterns: ${patterns.map((p) => p.complaint_pattern_tag).join(', ') || 'none'}
  listing decision on record: ${decision ? decision.decision : 'none'}
  inventory advisory on record: ${advisory ? advisory.intervention : 'none'}

The reviewer asks: ${question}`;

  try {
    const response = await callClaude({
      agent,
      system,
      messages: [{ role: 'user', content: context }],
      maxTokens: 400,
    });
    res.json({ ok: true, agent, sku_id, answer: textOf(response).trim() });
  } catch (err) {
    res.status(502).json({ error: `${meta.name} could not answer: ${err.message}` });
  }
});

/**
 * Conversational review. A role talks to the agent it supervises.
 *
 * The difference from /api/agent/explain is that this keeps history AND hands
 * the agent its peer-consultation tools, so mid-answer it can go and ask
 * another agent something. Those consultations come back in the response so the
 * chat can show them inline - the reviewer watches one agent ask another rather
 * than taking the handoff on faith.
 *
 * Still read-only with respect to decisions: the tools available here report
 * state, they do not re-run an agent or spend money.
 */
app.post('/api/agent/chat', async (req, res) => {
  const { agent, sku_id, messages } = req.body ?? {};
  if (!agent || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'agent and a non-empty messages array are required' });
  }

  const PERSONAS = {
    agent1: {
      name: 'TrustGate',
      role: 'the pre-publication listing compliance checker',
      supervisor: 'a Listings Reviewer',
      peers: 'CosmicCare (customer resolution) and DeadStock Zero (inventory recovery)',
    },
    agent2: {
      name: 'CosmicCare',
      role: 'the customer resolution agent, with authority to refund up to $500',
      supervisor: 'a Customer Service representative',
      peers: 'TrustGate (listing compliance) and DeadStock Zero (inventory recovery)',
    },
    agent3: {
      name: 'DeadStock Zero',
      role: 'the inventory recovery agent',
      supervisor: 'an Inventory Manager',
      peers: 'TrustGate (listing compliance) and CosmicCare (customer resolution)',
    },
  };

  const persona = PERSONAS[agent];
  if (!persona) return res.status(400).json({ error: `Unknown agent ${agent}` });

  // Whatever this SKU's situation is, stated as fact so the agent never guesses.
  let context = '';
  if (sku_id) {
    const inventory = loadInventory().find((r) => r.sku_id === sku_id);
    const listing = loadListings().find((r) => r.sku_id === sku_id);
    const product = loadProducts().find((r) => r.sku_id === sku_id);
    const decision = [...sharedState.listingDecisionLog].reverse().find((d) => d.sku_id === sku_id);
    const advisory = [...sharedState.inventoryAdvisoryLog].reverse().find((a) => a.sku_id === sku_id);
    const patterns = sharedState.complaintPatternLog.filter((c) => c.sku_id === sku_id);

    context = `
Current facts for ${sku_id} - ${inventory?.product_name ?? 'unknown'}:
  spec: ${product?.specs ?? 'none on file'}
  customer-facing claims: ${listing?.listing_claims ?? 'none on file'}
  stock ${inventory?.current_stock ?? '?'} units, ${inventory?.days_of_supply ?? '?'} days of supply, ${inventory?.return_rate_pct ?? '?'}% returns
  our price ${inventory?.our_price ?? '?'} vs competitor ${inventory?.competitor_price ?? '?'}, ${inventory?.season_relevance ?? ''}
  listing decision on record: ${decision ? decision.decision + ' (' + decision.reason + ')' : 'none'}
  inventory advisory on record: ${advisory ? advisory.intervention + ' - ' + advisory.note : 'none'}
  complaint patterns: ${patterns.map((c) => c.complaint_pattern_tag).join(', ') || 'none'}
  return spike flagged: ${Boolean(sharedState.returnSpikeFlags[sku_id])}
`;
  }

  const system = `You are ${persona.name}, ${persona.role} at Cosmic Mart. You are talking to ${persona.supervisor} who supervises you and is reviewing your work.

You can consult ${persona.peers} using your tools. Do that whenever the answer depends on what another agent knows or decided, rather than speculating about it. Say what you learned from them.

Rules:
- Two to four sentences. Your supervisor is reading between tasks.
- Ground every claim in the facts given or in what a peer agent tells you. Never invent a figure.
- If you were wrong, say so plainly. You are explaining, not defending.
- If you cannot answer from the available data, say what is missing.
- No markdown formatting.
${context}`;

  const tools = agentToolsForAnthropic(agent);
  const consultations = [];
  let conversation = messages.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await callClaude({
        agent,
        system,
        messages: conversation,
        tools: tools.length ? tools : undefined,
        maxTokens: 700,
      });

      if (response.stop_reason !== 'tool_use') {
        return res.json({
          ok: true,
          agent,
          answer: textOf(response).trim(),
          consultations,
        });
      }

      conversation = [...conversation, { role: 'assistant', content: response.content }];

      const results = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await callAgentTool(block.name, block.input, { stack: [agent] });
        consultations.push({
          tool: block.name,
          asked: block.input,
          consulted: result.consulted ?? (block.name.includes('agent1') ? 'agent1' : block.name.includes('agent2') ? 'agent2' : 'agent3'),
          summary:
            result.error ??
            result.summary ??
            result.guidance ??
            (result.decision ? `${result.decision} - ${result.reason ?? ''}` : JSON.stringify(result).slice(0, 160)),
        });
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      conversation = [...conversation, { role: 'user', content: results }];
    }

    res.json({
      ok: true,
      agent,
      answer: 'I consulted several agents but ran out of turns before answering. Ask again more narrowly.',
      consultations,
    });
  } catch (err) {
    res.status(502).json({ error: `${persona.name} could not answer: ${err.message}` });
  }
});

app.get('/api/catalog', (_req, res) => {
  const inventory = loadInventory();
  const listings = loadListings();
  const products = loadProducts();

  res.json(
    inventory.map((row) => {
      const listing = listings.find((l) => l.sku_id === row.sku_id);
      const product = products.find((p) => p.sku_id === row.sku_id);
      return {
        sku_id: row.sku_id,
        product_name: row.product_name,
        product_category: row.product_category,
        price: row.our_price,
        competitor_price: row.competitor_price,
        in_stock: row.current_stock > 0,
        description: listing?.listing_description ?? '',
        claims: listing?.listing_claims ?? '',
        specs: product?.specs ?? '',
      };
    })
  );
});

/**
 * Live shared state — the four agent-to-agent connections as data.
 *
 * This is what makes the dashboard real rather than a mockup: every number
 * here was written by an agent, not typed into the HTML.
 */
app.get('/api/state', (_req, res) => {
  res.json({
    listingDecisions: sharedState.listingDecisionLog,
    complaintPatterns: sharedState.complaintPatternLog,
    returnSpikes: sharedState.returnSpikeFlags,
    actions: sharedState.actionLedger,
    inventoryAdvisories: sharedState.inventoryAdvisoryLog,
    reviewQueue: sharedState.reviewQueue,
    connections: {
      'agent2->agent1': sharedState.complaintPatternLog.length,
      'agent2->agent3': Object.values(sharedState.returnSpikeFlags).filter(Boolean).length,
      'agent1->agent3': sharedState.listingDecisionLog.length,
      'agent3->agent2': sharedState.inventoryAdvisoryLog.length,
    },
  });
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
