import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callClaude, extractJSON, textOf } from '../llm.js';
import { logComplaintPattern, flagReturnSpike } from '../state.js';
import { validate, AGENT2_OUTPUT } from '../contracts.js';
import { TOOL_DEFS, toolHandlers } from '../tools/index.js';
import { buildPrompt } from '../prompts/prompt_agent2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'src', 'data');

// ── CSV parsing ───────────────────────────────────────────────────────────────

function splitCSVLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  result.push(field.trim());
  return result;
}

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

// sku_id -> product_category, built once at module load
const skuToCategory = Object.fromEntries(
  parseCSV(path.join(DATA, 'cosmic_mart_products.csv')).map(p => [p.sku_id, p.product_category])
);

export function loadComplaints() {
  return parseCSV(path.join(DATA, 'cosmic_mart_complaints.csv'));
}

// ── Pre-flight escalation checks (code-enforced, before LLM call) ─────────────

const LEGAL_KEYWORDS = [
  'legal action', 'lawyer', 'solicitor', 'attorney', 'sue ', 'suing',
  'court', 'regulatory', 'trading standards', 'consumer protection', 'watchdog',
];

function hasLegalThreat(text) {
  const lower = (text ?? '').toLowerCase();
  return LEGAL_KEYWORDS.some(kw => lower.includes(kw));
}

function hasRepeatComplaint(customer_history) {
  return /\bone prior complaint\b/i.test(customer_history ?? '');
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export async function resolve(complaint) {
  const product_category = skuToCategory[complaint.sku_id] ?? 'unknown';
  const enriched = { ...complaint, product_category };

  // Legal threat — code-enforced, no LLM involved
  if (hasLegalThreat(enriched.complaint_description)) {
    const result = {
      action_taken: 'Escalated to human — legal threat detected in complaint text.',
      response_to_customer: `Thank you for reaching out, ${enriched.customer_name}. Given the nature of your concern, I am escalating this to our specialist team who will contact you within one business day.`,
      complaint_pattern_tag: 'misleading description',
      escalate_to_human: true,
    };
    logComplaintPattern({ complaint_pattern_tag: result.complaint_pattern_tag, product_category, sku_id: enriched.sku_id });
    return result;
  }

  // Repeat complaint — code-enforced
  if (hasRepeatComplaint(enriched.customer_history)) {
    const result = {
      action_taken: 'Escalated to human — repeat complaint detected from customer history.',
      response_to_customer: `Hi ${enriched.customer_name}, I can see you have contacted us about this before and I want to make sure we get this right. I am escalating your case to a senior team member who will reach out to you directly.`,
      complaint_pattern_tag: 'product defect',
      escalate_to_human: true,
    };
    logComplaintPattern({ complaint_pattern_tag: result.complaint_pattern_tag, product_category, sku_id: enriched.sku_id });
    return result;
  }

  // ── Tool-use loop ────────────────────────────────────────────────────────────

  const system = buildPrompt(enriched);
  let messages = [{ role: 'user', content: `Please resolve complaint ${enriched.complaint_id} for customer ${enriched.customer_name}.` }];

  let response;
  for (let turn = 0; turn < 5; turn++) {
    response = await callClaude({ agent: 'agent2', system, messages, tools: TOOL_DEFS, maxTokens: 2048 });

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      // Append the full assistant turn (may have text blocks before the tool_use block)
      messages = [...messages, { role: 'assistant', content: response.content }];

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const fn = toolHandlers[block.name];
        if (!fn) throw new Error(`Unknown tool requested by model: ${block.name}`);
        const toolResult = await fn(block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult),
        });
      }

      messages = [...messages, { role: 'user', content: toolResults }];
    }
  }

  const result = extractJSON(textOf(response));

  // Throws ContractError listing every broken field at once
  validate('agent2', AGENT2_OUTPUT, result);

  // ── Feedback loops ───────────────────────────────────────────────────────────

  logComplaintPattern({ complaint_pattern_tag: result.complaint_pattern_tag, product_category, sku_id: enriched.sku_id });

  const actionLower = (result.action_taken ?? '').toLowerCase();
  if (actionLower.includes('refund') || actionLower.includes('replacement')) {
    flagReturnSpike(enriched.sku_id);
  }

  return result;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

// Hard-coded order values for demo complaints (order_value is not in the CSV).
// CMP-004 is intentionally above $500 to demonstrate the authority cap on stage.
const ORDER_VALUES = {
  'CMP-001': 299,
  'CMP-002': 149,
  'CMP-003': 55,
  'CMP-004': 750,
  'CMP-005': 39,
  'CMP-006': 29,
  'CMP-007': 89,
  'CMP-008': 45,
  'CMP-009': 65,
  'CMP-010': 38,
  'CMP-017': 45,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const complaintId = process.argv[2];
  if (!complaintId) {
    console.error('Usage: node src/agents/agent2_resolution.js <complaint_id>');
    process.exit(1);
  }

  const complaints = loadComplaints();
  const complaint = complaints.find(c => c.complaint_id === complaintId);
  if (!complaint) {
    console.error(`Complaint ${complaintId} not found in CSV.`);
    process.exit(1);
  }

  const enrichedComplaint = { ...complaint, order_value: ORDER_VALUES[complaintId] ?? 99 };

  console.log(`\nResolving ${complaintId} — ${complaint.customer_name} (${complaint.emotional_tone})\n`);
  resolve(enrichedComplaint)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Resolution failed:', err.message);
      process.exit(1);
    });
}
