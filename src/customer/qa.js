/**
 * Customer Q&A responder.
 *
 * Handles the "question" branch of the customer chat: a genuine information
 * request that does not need Agent 2's resolution authority or a human review.
 * It answers helpfully and briefly, and never promises refunds, replacements,
 * or fee waivers — those are Agent 2's job and require the human gate.
 */

import { callJSON } from '../llm.js';

const SYSTEM = `\
You are Cosmic Mart's friendly customer-chat assistant, answering a customer question.

Rules:
- Answer helpfully and briefly (2-4 sentences), in a warm, natural tone.
- You may talk about products, orders, shipping, and how the store works in general terms.
- You must NOT offer or promise refunds, replacements, discounts, or fee waivers — if the customer needs one, tell them you're logging it for a specialist to action.
- If the question is off-topic (not about Cosmic Mart, its products, or orders), politely decline and steer back.

Return ONLY this JSON — no prose outside it, no markdown fences:
{
  "response": "your message to the customer"
}`;

/**
 * @param {string} message - the customer's question
 * @param {object} [customer] - optional persona context (name, product_name, order_id)
 * @returns {Promise<{ response: string }>}
 */
export async function answer(message, customer = {}) {
  const context = customer.customer_name
    ? `Customer: ${customer.customer_name}. Recent product: ${customer.product_name ?? 'n/a'} (order ${customer.order_id ?? 'n/a'}).`
    : '';

  const result = await callJSON({
    agent: 'qa',
    system: SYSTEM,
    messages: [
      { role: 'user', content: context ? `${context}\n\nQuestion: ${message}` : message },
    ],
    maxTokens: 512,
  });

  return { response: result.response ?? "I'm sorry, I didn't catch that — could you rephrase?" };
}
