import { REFUND_AUTHORITY_LIMIT } from '../contracts.js';
import { recordAction } from '../state.js';

// ── Tool definitions (Anthropic input_schema format) ─────────────────────────

export const TOOL_DEFS = [
  {
    name: 'issue_refund',
    description:
      'Issue a refund for a customer complaint. Automatically refuses if the amount exceeds the $500 authority limit and returns a reason the agent can act on.',
    input_schema: {
      type: 'object',
      properties: {
        complaint_id: { type: 'string', description: 'Complaint ID, e.g. CMP-001' },
        order_id: { type: 'string', description: 'Order ID, e.g. CM-2201' },
        sku_id: { type: 'string', description: 'SKU being refunded, e.g. SKU-1001' },
        amount: { type: 'number', description: 'Refund amount in USD' },
        reason: { type: 'string', description: 'One-sentence explanation for the audit log' },
      },
      required: ['complaint_id', 'order_id', 'sku_id', 'amount', 'reason'],
    },
  },
  {
    name: 'dispatch_replacement',
    description: 'Dispatch a replacement unit for a customer complaint.',
    input_schema: {
      type: 'object',
      properties: {
        complaint_id: { type: 'string' },
        order_id: { type: 'string' },
        sku_id: { type: 'string' },
        product_name: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['complaint_id', 'order_id', 'sku_id', 'product_name', 'reason'],
    },
  },
  {
    name: 'waive_fee',
    description: 'Waive a fee (shipping, restocking, late, etc.) for a customer complaint. No upper limit.',
    input_schema: {
      type: 'object',
      properties: {
        complaint_id: { type: 'string' },
        order_id: { type: 'string' },
        fee_type: { type: 'string', description: 'e.g. shipping, restocking, late' },
        amount: { type: 'number', description: 'Fee amount in USD' },
        reason: { type: 'string' },
      },
      required: ['complaint_id', 'order_id', 'fee_type', 'amount', 'reason'],
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function issue_refund({ complaint_id, order_id, sku_id, amount, reason }) {
  // Cap enforced in code — a limit that lives only in a prompt is a suggestion.
  if (amount > REFUND_AUTHORITY_LIMIT) {
    return {
      success: false,
      reason: `Refund of $${amount} exceeds the $${REFUND_AUTHORITY_LIMIT} authority limit. This case must be escalated to a human agent.`,
    };
  }
  recordAction({ type: 'refund', complaint_id, order_id, sku_id, amount, reason });
  return { success: true, amount, message: `Refund of $${amount} approved for order ${order_id}.` };
}

async function dispatch_replacement({ complaint_id, order_id, sku_id, product_name, reason }) {
  recordAction({ type: 'replacement', complaint_id, order_id, sku_id, product_name, reason });
  return { success: true, message: `Replacement for ${product_name} (${sku_id}) dispatched on order ${order_id}.` };
}

async function waive_fee({ complaint_id, order_id, fee_type, amount, reason }) {
  recordAction({ type: 'fee_waiver', complaint_id, order_id, fee_type, amount, reason });
  return { success: true, amount, message: `${fee_type} fee of $${amount} waived for order ${order_id}.` };
}

export const toolHandlers = { issue_refund, dispatch_replacement, waive_fee };
