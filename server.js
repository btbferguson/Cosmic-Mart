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
import {
  buildListingInput,
  agentToolsForAnthropic,
  callAgentTool,
} from './src/agents/registry.js';
import { callClaude, textOf } from './src/llm.js';
import { checkListing } from './src/agents/agent1_factchecker.js';
import { loadInventory, loadListings, loadProducts } from './src/data/loadData.js';

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

/* ------------------------------------------------------------------ *
 * TrustGate — Listings (Agent 1)
 * ------------------------------------------------------------------ */

const DECISION_TO_STATUS = { approved: 'approved', escalate: 'needs_review', 'auto-blocked': 'auto_blocked' };
const DECISION_TO_AI    = { approved: 'approved', escalate: 'escalate', 'auto-blocked': 'blocked' };

/** All listings from the CSV, shaped for the TrustGate queue. No AI calls. */
/**
 * Inventory for the DeadStock Zero table.
 *
 * Shaped to match what ui/index.html already renders (sku_name, velocity,
 * return_spike, ...) so the screen needed no restructuring - only a fetch in
 * place of the hardcoded mockInventory array.
 *
 * risk_level here is derived from days of supply alone, as a cheap pre-sort for
 * the table. It is NOT the agent's verdict: Agent 3 decides that, and only when
 * a reviewer opens the row.
 */
/**
 * Chat with an agent about a SKU.
 *
 * Keeps conversation history AND hands the agent its peer-consultation tools,
 * so mid-answer it can go and ask another agent something. Those consultations
 * come back in the response so the UI can show them - a reviewer watches one
 * agent ask another rather than taking the handoff on faith.
 *
 * Read-only with respect to decisions: the peer tools report state, they do not
 * re-run an agent or spend money. A reviewer can interrogate freely.
 */
app.post('/api/agent/chat', async (req, res) => {
  const { agent = 'agent3', sku_id, messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'a non-empty messages array is required' });
  }

  const PERSONAS = {
    agent1: {
      name: 'TrustGate',
      role: 'the pre-publication listing compliance checker',
      boss: 'a Listings Reviewer',
      peers: 'CosmicCare (customer resolution) and DeadStock Zero (inventory recovery)',
    },
    agent2: {
      name: 'CosmicCare',
      role: 'the customer resolution agent, with authority to refund up to $500',
      boss: 'a Customer Service representative',
      peers: 'TrustGate (listing compliance) and DeadStock Zero (inventory recovery)',
    },
    agent3: {
      name: 'DeadStock Zero',
      role: 'the inventory recovery agent',
      boss: 'an Inventory Manager',
      peers: 'TrustGate (listing compliance) and CosmicCare (customer resolution)',
    },
  };

  const persona = PERSONAS[agent];
  if (!persona) return res.status(400).json({ error: `Unknown agent ${agent}` });

  let facts = '';
  if (sku_id) {
    const row = loadInventory().find((r) => r.sku_id === sku_id);
    const listing = loadListings().find((r) => r.sku_id === sku_id);
    const product = loadProducts().find((r) => r.sku_id === sku_id);
    const decision = [...sharedState.listingDecisionLog].reverse().find((d) => d.sku_id === sku_id);
    const advisory = [...sharedState.inventoryAdvisoryLog].reverse().find((a) => a.sku_id === sku_id);
    const patterns = sharedState.complaintPatternLog.filter((c) => c.sku_id === sku_id);

    facts = `
Facts for ${sku_id} - ${row?.product_name ?? 'unknown'}:
  stock ${row?.current_stock ?? '?'} units, ${row?.sales_velocity_weekly ?? '?'}/week, ${row?.days_of_supply ?? '?'} days of supply
  ${row?.season_relevance ?? ''}, return rate ${row?.return_rate_pct ?? '?'}%
  our price ${row?.our_price ?? '?'} vs competitor ${row?.competitor_price ?? '?'}
  analyst notes: ${row?.notes ?? 'none'}
  specification: ${product?.specs ?? 'none on file'}
  customer-facing claims: ${listing?.listing_claims ?? 'none on file'}
  your advisory on record: ${advisory ? advisory.intervention + ' - ' + advisory.note : 'none yet'}
  TrustGate decision on record: ${decision ? decision.decision + ' (' + decision.reason + ')' : 'none'}
  CosmicCare complaint patterns: ${patterns.map((c) => c.complaint_pattern_tag).join(', ') || 'none'}
  return spike flagged: ${Boolean(sharedState.returnSpikeFlags[sku_id])}
`;
  }

  const system = `You are ${persona.name}, ${persona.role} at Cosmic Mart. You are talking to ${persona.boss} who supervises you and is reviewing your work.

You can consult ${persona.peers} using your tools. Do that whenever the answer depends on what another agent knows or decided, rather than speculating. Say what you learned from them.

Rules:
- Two to four sentences. Your supervisor is reading between tasks.
- Ground every claim in the facts below or in what a peer agent tells you. Never invent a figure.
- If you were wrong, say so plainly. You are explaining, not defending.
- If the data cannot answer the question, say what is missing.
- No markdown formatting.
${facts}`;

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
        return res.json({ ok: true, agent, answer: textOf(response).trim(), consultations });
      }

      conversation = [...conversation, { role: 'assistant', content: response.content }];

      const results = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await callAgentTool(block.name, block.input, { stack: [agent] });
        consultations.push({
          tool: block.name,
          consulted:
            result.consulted ??
            (block.name.includes('agent1') ? 'agent1' : block.name.includes('agent2') ? 'agent2' : 'agent3'),
          summary:
            result.error ??
            result.summary ??
            result.guidance ??
            (result.decision ? result.decision + ' - ' + (result.reason ?? '') : JSON.stringify(result).slice(0, 160)),
        });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      conversation = [...conversation, { role: 'user', content: results }];
    }

    res.json({
      ok: true,
      agent,
      answer: 'I consulted other agents but ran out of turns. Ask again more narrowly.',
      consultations,
    });
  } catch (err) {
    res.status(502).json({ error: `${persona.name} could not answer: ${err.message}` });
  }
});

app.get('/api/inventory', (_req, res) => {
  const CATEGORY_LABEL = {
    gadgets: 'Gadgets',
    fashion: 'Fashion',
    'home and lifestyle': 'Home & Lifestyle',
  };

  res.json(
    loadInventory().map((row) => {
      const advisory = [...sharedState.inventoryAdvisoryLog]
        .reverse()
        .find((a) => a.sku_id === row.sku_id);

      return {
        sku_id: row.sku_id,
        sku_name: row.product_name,
        category: CATEGORY_LABEL[row.product_category] ?? row.product_category,
        stock: row.current_stock,
        velocity: row.sales_velocity_weekly,
        days_of_supply: row.days_of_supply,
        season: row.season_relevance === 'seasonal' ? 'Seasonal' : 'Evergreen',
        our_price: row.our_price,
        competitor_price: row.competitor_price,
        return_rate_pct: row.return_rate_pct,
        // The real cross-agent signal, not a guess.
        return_spike: Boolean(sharedState.returnSpikeFlags[row.sku_id]),
        notes: row.notes,
        risk_level: row.days_of_supply > 60 ? 'high' : row.days_of_supply >= 30 ? 'medium' : 'low',
        // Populated only once Agent 3 has actually assessed this SKU.
        intervention: advisory ? advisory.intervention : 'Not assessed',
        reason: advisory ? advisory.note : null,
        assessed: Boolean(advisory),
        status: advisory ? 'assessed' : 'pending',
      };
    })
  );
});

/**
 * Run Agent 3 on one SKU. Called when a reviewer opens an inventory row.
 *
 * Runs in this process, so whatever the agent writes to shared state is
 * immediately visible to the other agents and to the portal. It reads the
 * signals Agents 1 and 2 have left, and publishes an advisory back to Agent 2.
 */
/**
 * Assessments already produced, keyed by SKU.
 *
 * A reviewer opening the same row twice should not pay for the agent twice. The
 * advisory is already on record in shared state, so re-running would spend a
 * live model call to re-derive an answer we are holding. Pass ?refresh=1 to
 * force a fresh run - that is what the Re-run button does.
 */
const assessmentCache = new Map();

app.post('/api/inventory/:skuId/assess', async (req, res) => {
  const { skuId } = req.params;
  const row = loadInventory().find((r) => r.sku_id === skuId);
  if (!row) return res.status(404).json({ error: `No inventory record for ${skuId}` });

  const refresh = req.query.refresh === '1' || req.body?.refresh === true;
  if (!refresh && assessmentCache.has(skuId)) {
    return res.json({ ...assessmentCache.get(skuId), cached: true });
  }

  let assessment;
  try {
    const { assessSku } = await import('./src/agents/agent3_deadstock.js');
    // Stream what the agent actually does, as it does it. The panel shows these
    // instead of an indefinite spinner - the progress is real, not a
    // pre-scripted animation, so an empty run shows an empty trace.
    assessment = await assessSku(skuId, {
      onEvent: (event) => {
        const step =
          event.type === 'tool'
            ? `Reading ${event.name.replace(/^get_/, '').replace(/_/g, ' ')}`
            : event.type === 'agentCall'
              ? `Consulting ${event.name.includes('agent1') ? 'TrustGate' : 'CosmicCare'}`
              : event.type === 'thinking'
                ? 'Reasoning over the figures'
                : null;
        if (step) broadcast({ type: 'agent3Progress', sku_id: skuId, step });
      },
    });
  } catch (err) {
    return res.status(502).json({ error: `Agent 3 failed: ${err.message}` });
  }

  const { decision, signals, trace } = assessment;

  broadcast({ type: 'agentRan', agent: 'agent3', sku_id: skuId, result: decision });

  const payload = {
    sku_id: skuId,
    sku_name: row.product_name,
    risk_level: decision.risk_level,
    intervention: decision.intervention,
    reason: decision.reason,
    estimated_recovery: decision.estimated_recovery,
    brief_line: decision.weekly_brief_line,
    // Whether a guardrail overrode the model, so the UI can show it.
    guardrail: decision.guardrail ?? null,
    // What it read from the other two agents.
    signals: {
      return_spike: signals.return_spike_flag,
      listing_decision: signals.listing_decision ? signals.listing_decision.decision : null,
      listing_reason: signals.listing_decision ? signals.listing_decision.reason : null,
    },
    // Which tools it called, including any peer consultations.
    tool_calls: trace.toolCalls.map((t) => ({ name: t.name, agent: Boolean(t.agent) })),
    assessed: true,
    status: 'assessed',
  };

  assessmentCache.set(skuId, payload);
  res.json(payload);
});

/**
 * The four cross-agent connections, as live counts. Feeds the signal-flow panel.
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

app.get('/api/listings', (_req, res) => {
  const listings = loadListings();
  const products  = loadProducts();
  res.json(
    listings.map((row) => {
      const product = products.find((p) => p.sku_id === row.sku_id);
      return {
        id:             row.sku_id,
        sku_id:         row.sku_id,
        product_name:   row.product_name,
        category:       product?.product_category ?? 'gadgets',
        market:         'North America',
        description:    row.listing_description,
        claims:         row.listing_claims,
        status:         'pending',
        submitted:      'in queue',
        ai_decision:    null,
        confidence:     null,
        reason:         null,
        recommendation: null,
        complaint_signal: null,
      };
    }),
  );
});

/**
 * Run Agent 1 on one listing and return the result merged with listing metadata.
 * The UI calls this when a reviewer opens a specific listing card.
 */
app.post('/api/listings/:skuId/check', async (req, res) => {
  const { skuId } = req.params;
  const listing = buildListingInput(skuId);
  if (!listing) return res.status(404).json({ error: `No listing on file for ${skuId}` });

  let result;
  try {
    result = await checkListing(listing);
  } catch (err) {
    return res.status(502).json({ error: `Agent 1 failed: ${err.message}` });
  }

  res.json({
    id:             skuId,
    sku_id:         skuId,
    product_name:   listing.product_name,
    category:       listing.product_category,
    market:         listing.market_region,
    description:    listing.product_description,
    claims:         listing.claims,
    status:         DECISION_TO_STATUS[result.decision] ?? 'needs_review',
    submitted:      'just now',
    ai_decision:    DECISION_TO_AI[result.decision] ?? 'escalate',
    confidence:     result.confidence,
    reason:         result.reason,
    recommendation: result.recommendation_to_reviewer || null,
    complaint_signal: result.complaint_signal === 'no-signal' ? null : result.complaint_signal,
  });
});

app.listen(PORT, () => {
  console.log(`CosmicTrust demo on http://localhost:${PORT}`);
  console.log(`  customer chat → http://localhost:${PORT}/customer`);
  console.log(`  employee portal → http://localhost:${PORT}/`);
  console.log(`  LLM mode: ${process.env.COSMIC_LLM_MODE || 'live'}`);
});
