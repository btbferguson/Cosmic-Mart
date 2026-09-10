import type { Product, SharedState } from './types';

/**
 * All API access. Vite proxies /api to the Express server on :3000, which owns
 * the agents — so nothing here talks to a model directly.
 */

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `${path} returned ${res.status}`);
  return json as T;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** The storefront catalogue — the same 50 SKUs the agents police. */
export const getCatalog = () => get<Product[]>('/api/catalog');

/** Live shared state. Every number here was written by an agent. */
export const getState = () => get<SharedState>('/api/state');

/** Agent 2's output, attached to the card once a reviewer approves. */
export interface Resolution {
  action_taken: string;
  response_to_customer: string;
  complaint_pattern_tag: string;
  escalate_to_human: boolean;
}

export interface ReviewCard {
  /** server.js calls this reviewId, not id. */
  reviewId: string;
  status: string;
  sku_id?: string;
  product_name?: string;
  customer_name?: string;
  customer_history?: string;
  complaint_description?: string;
  predicted_tag?: string;
  emotional_tone?: string;
  /** Present only once resolved. */
  resolution?: Resolution;
}

export const getReviewCards = () => get<ReviewCard[]>('/api/complaints');

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** The human gate. Approving is what lets Agent 2 spend money. */
export const resolveReview = (id: string, verdict: 'approved' | 'rejected') =>
  post<{ ok: boolean }>(`/api/review/${id}/resolve`, { verdict });

/** Run Agent 1 on a listing, in the server process so the portal sees it. */
export const runAgent1 = (sku_id: string) =>
  post<{ result: { decision: string; reason: string } }>('/api/agent1/check', { sku_id });

/** Run Agent 3 on a SKU, reading whatever Agents 1 and 2 have written. */
export const runAgent3 = (sku_id: string) =>
  post<{
    result: { intervention: string; risk_level: string; reason: string };
    toolCalls: string[];
  }>('/api/agent3/assess', { sku_id });

/**
 * Ask an agent to justify a decision it already made.
 *
 * Read-only: never re-runs the agent, never changes a decision, never spends
 * money — so a reviewer can interrogate freely.
 */
export const askAgent = (
  agent: 'agent1' | 'agent2' | 'agent3',
  sku_id: string,
  question: string
) => post<{ answer: string }>('/api/agent/explain', { agent, sku_id, question });

/** One peer consultation an agent made while answering. */
export interface Consultation {
  tool: string;
  consulted: string;
  summary: string;
}

/**
 * Conversational review with an agent.
 *
 * Unlike askAgent this keeps history and hands the agent its peer-consultation
 * tools, so it can go and ask another agent mid-answer. Those exchanges come
 * back in `consultations` so the chat can show them inline.
 */
export const chatWithAgent = (
  agent: 'agent1' | 'agent2' | 'agent3',
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  sku_id?: string
) =>
  post<{ answer: string; consultations: Consultation[] }>('/api/agent/chat', {
    agent,
    sku_id,
    messages,
  });
