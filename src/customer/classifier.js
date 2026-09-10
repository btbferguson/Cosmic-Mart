/**
 * Customer-message classifier — the front door of the customer chat.
 *
 * Routes each incoming message to one of two paths:
 *   - question:  answered directly by the Q&A agent, no human loop.
 *   - complaint: queued for a human to approve before Agent 2 spends its
 *                tool budget resolving it.
 *
 * Cheap and deterministic (goes through src/llm.js at temperature 0). It does
 * NOT resolve anything — it only decides where the message goes and previews
 * the pattern tag a reviewer will confirm.
 */

import { callJSON } from '../llm.js';

/** The only tags Agent 2 accepts. Kept identical so the reviewer's preview matches. */
export const COMPLAINT_TAGS = [
  'misleading description',
  'wrong item',
  'damaged delivery',
  'product defect',
  'late delivery',
  'no complaint',
];

const SYSTEM = `\
You are the intake classifier for Cosmic Mart's customer chat. Read one customer message and decide how it should be handled.

Return ONLY this JSON — no prose, no markdown fences:
{
  "type": "question" | "complaint",
  "predicted_tag": "one tag from the list below",
  "reason": "one short sentence"
}

Definitions:
- "question": the customer is asking for information (product specs, availability, how something works, order status curiosity) and is NOT reporting that something went wrong.
- "complaint": the customer reports a problem — a defect, damage, wrong/late/missing item, or a claim that the product did not match its description.

predicted_tag must be exactly one of:
misleading description | wrong item | damaged delivery | product defect | late delivery | no complaint

Use "no complaint" whenever type is "question". Listing inaccuracies ("it said X but X isn't true") are "misleading description", not "product defect".`;

/**
 * @param {string} message - the raw customer message
 * @returns {Promise<{ type: 'question'|'complaint', predicted_tag: string, reason: string }>}
 */
export async function classify(message) {
  const result = await callJSON({
    agent: 'classifier',
    system: SYSTEM,
    messages: [{ role: 'user', content: message }],
    maxTokens: 256,
  });

  // Normalise defensively so a stray model tag never breaks routing downstream.
  const type = result.type === 'complaint' ? 'complaint' : 'question';
  let predicted_tag = COMPLAINT_TAGS.includes(result.predicted_tag)
    ? result.predicted_tag
    : 'no complaint';
  if (type === 'question') predicted_tag = 'no complaint';

  return { type, predicted_tag, reason: result.reason ?? '' };
}
