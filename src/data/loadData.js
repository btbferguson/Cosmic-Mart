/**
 * The deterministic data layer.
 *
 * Everything the agent knows about a SKU comes from here, computed in code.
 * The model is never asked to remember or derive a number - it only reasons
 * over the text. That split is the whole design: exact facts from code, messy
 * judgement from the model.
 *
 * The `notes` column contains commas inside quotes, so line.split(',') is
 * wrong. We have no CSV dependency (and AGENTS.md says not to add one), so
 * there is a small RFC 4180 parser below. It is tested in tests/agent3.test.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/**
 * Parse CSV text into an array of string arrays.
 * Handles quoted fields, escaped "" inside quotes, embedded commas and
 * newlines, and both CRLF and LF line endings.
 */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // an escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Whatever is left over when the file does not end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Parse CSV into objects keyed by the header row, skipping blank lines. */
export function parseCSVObjects(text) {
  const rows = parseCSV(text).filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
  if (rows.length === 0) return [];

  const header = rows[0];
  return rows.slice(1).map((cells) =>
    Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']))
  );
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

const cache = new Map();

function load(filename, coerce = (row) => row) {
  if (cache.has(filename)) return cache.get(filename);
  const text = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
  const rows = parseCSVObjects(text).map(coerce);
  cache.set(filename, rows);
  return rows;
}

const num = (value) => (value === '' || value == null ? null : Number(value));

export function loadInventory() {
  return load('cosmic_mart_inventory.csv', (row) => ({
    ...row,
    current_stock: num(row.current_stock),
    sales_velocity_weekly: num(row.sales_velocity_weekly),
    days_of_supply: num(row.days_of_supply),
    our_price: num(row.our_price),
    competitor_price: num(row.competitor_price),
    return_rate_pct: num(row.return_rate_pct),
  }));
}

export const loadProducts = () => load('cosmic_mart_products.csv');
export const loadListings = () => load('cosmic_mart_listings.csv');
export const loadComplaints = () => load('cosmic_mart_complaints.csv');

/* ------------------------------------------------------------------ *
 * Joining
 * ------------------------------------------------------------------ */

/** Every SKU in the inventory file, in file order. */
export const allSkuIds = () => loadInventory().map((row) => row.sku_id);

export const getInventoryRow = (skuId) =>
  loadInventory().find((row) => row.sku_id === skuId) ?? null;

/**
 * One SKU with everything we know about it joined on sku_id.
 *
 * inventory (1:1) + product specs (1:1) + listing (1:1) + complaints (0..n).
 * Returns null for an unknown SKU rather than throwing, so the CLI can print
 * a helpful message instead of a stack trace.
 */
export function getEnrichedSku(skuId) {
  const inventory = getInventoryRow(skuId);
  if (!inventory) return null;

  const product = loadProducts().find((row) => row.sku_id === skuId) ?? null;
  const listing = loadListings().find((row) => row.sku_id === skuId) ?? null;
  const complaints = loadComplaints().filter((row) => row.sku_id === skuId);

  return {
    ...inventory,
    specs: product?.specs ?? null,
    listing_description: listing?.listing_description ?? null,
    listing_claims: listing?.listing_claims ?? null,
    complaints,
  };
}

/**
 * Category-level context, so the agent can judge a SKU against its peers
 * rather than against an absolute number it has no feel for.
 */
export function getCategoryPeers(category) {
  const peers = loadInventory().filter((row) => row.product_category === category);
  if (peers.length === 0) return null;

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return {
    product_category: category,
    sku_count: peers.length,
    median_days_of_supply: median(peers.map((row) => row.days_of_supply)),
    median_return_rate_pct: median(peers.map((row) => row.return_rate_pct)),
    seasonal_count: peers.filter((row) => row.season_relevance === 'seasonal').length,
  };
}

/** Only used by tests and the --list command. */
export function clearCache() {
  cache.clear();
}
