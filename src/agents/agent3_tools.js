/**
 * The tools DeadStock Zero may call.
 *
 * Pair B owns src/tools/ for Agent 2's action tools, so Agent 3's live here
 * beside the agent that uses them.
 *
 * Every one of these reads real rows from the CSVs. None of them invent
 * anything, and none of them let the model write. The SKU's own inventory row
 * is injected into the prompt directly, so a skipped tool call can never make a
 * *number* wrong - tools only add qualitative context the model chose to go and
 * get. That choice is what makes this agentic rather than a classifier.
 */

import {
  getEnrichedSku,
  getInventoryRow,
  getCategoryPeers,
  loadComplaints,
  loadListings,
  loadProducts,
} from '../data/loadData.js';

/** OpenAI-style tool definitions, sent to the model on every turn. */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_product_specs',
      description:
        'Get the manufacturer technical specification for a SKU. This is ground truth ' +
        'about what the product actually is and does. Use it to check whether the ' +
        'marketing claims on the listing are actually supportable.',
      parameters: {
        type: 'object',
        properties: {
          sku_id: { type: 'string', description: 'e.g. SKU-1001' },
        },
        required: ['sku_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_listing',
      description:
        'Get the customer-facing listing description and promotional claims for a SKU. ' +
        'Compare against the product specs to find claims the product cannot support - ' +
        'a common root cause of returns.',
      parameters: {
        type: 'object',
        properties: {
          sku_id: { type: 'string', description: 'e.g. SKU-1001' },
        },
        required: ['sku_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_complaints',
      description:
        'Get customer complaints filed against a SKU. Returns an empty list if there ' +
        'are none. Complaint text tells you WHY units are coming back, which decides ' +
        'whether a price change would help or make things worse.',
      parameters: {
        type: 'object',
        properties: {
          sku_id: { type: 'string', description: 'e.g. SKU-1001' },
        },
        required: ['sku_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_category_peers',
      description:
        'Get median days of supply and return rate across all SKUs in a product ' +
        'category. Use it to judge whether this SKU is genuinely an outlier or just ' +
        'normal for its category.',
      parameters: {
        type: 'object',
        properties: {
          product_category: {
            type: 'string',
            enum: ['gadgets', 'fashion', 'home and lifestyle'],
          },
        },
        required: ['product_category'],
        additionalProperties: false,
      },
    },
  },
];

/* ------------------------------------------------------------------ *
 * Implementations
 * ------------------------------------------------------------------ */

const notFound = (what, id) => ({ error: `No ${what} found for ${id}` });

const IMPLEMENTATIONS = {
  get_product_specs({ sku_id }) {
    const product = loadProducts().find((row) => row.sku_id === sku_id);
    if (!product) return notFound('product', sku_id);
    return {
      sku_id,
      product_name: product.product_name,
      product_category: product.product_category,
      specs: product.specs,
    };
  },

  get_listing({ sku_id }) {
    const listing = loadListings().find((row) => row.sku_id === sku_id);
    if (!listing) return notFound('listing', sku_id);
    return {
      sku_id,
      listing_description: listing.listing_description,
      listing_claims: listing.listing_claims,
    };
  },

  get_complaints({ sku_id }) {
    const complaints = loadComplaints()
      .filter((row) => row.sku_id === sku_id)
      .map((row) => ({
        complaint_id: row.complaint_id,
        complaint_description: row.complaint_description,
        emotional_tone: row.emotional_tone,
        customer_history: row.customer_history,
      }));
    // An empty list is a real answer, not a failure - say so explicitly so the
    // model does not read silence as "I could not check".
    return { sku_id, complaint_count: complaints.length, complaints };
  },

  get_category_peers({ product_category }) {
    return getCategoryPeers(product_category) ?? notFound('category', product_category);
  },
};

/**
 * Run one tool call by name.
 * Unknown names and thrown errors come back as an { error } object so the model
 * can recover on the next turn instead of the whole run dying.
 */
export function executeTool(name, args) {
  const implementation = IMPLEMENTATIONS[name];
  if (!implementation) return { error: `Unknown tool: ${name}` };
  try {
    return implementation(args ?? {});
  } catch (error) {
    return { error: `${name} failed: ${error.message}` };
  }
}

export { getEnrichedSku, getInventoryRow };
