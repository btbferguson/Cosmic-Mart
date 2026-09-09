/**
 * Temporary stand-in for Agents 1 and 2.
 *
 * DeadStock Zero reads two cross-agent signals out of shared state:
 *   return_spike_flag  - written by Agent 2 when it refunds or replaces
 *   listing_decision   - written by Agent 1 when it blocks or escalates a listing
 *
 * Neither agent exists yet. Rather than fake the signals inside Agent 3 (which
 * would mean rewriting the agent later), we write them into the real shared
 * state through the real writer functions. Agent 3 reads them exactly as it
 * will in the finished system.
 *
 * DELETE THIS FILE once Agents 1 and 2 are running. Nothing in src/ imports it.
 */

import { flagReturnSpike, logListingDecision, reset } from '../src/state.js';
import { loadInventory } from '../src/data/loadData.js';

/** Above this return rate we treat the SKU as one Agent 2 would have flagged. */
const RETURN_SPIKE_THRESHOLD_PCT = 10;

/** The analyst notes say so explicitly on the SKUs Agent 1 would have caught. */
const AGENT1_MARKER = /agent 1 flagged|under agent 1 review|agent 1 approved/i;

export function seedSignals({ quiet = true } = {}) {
  reset();

  let spikes = 0;
  let decisions = 0;

  for (const row of loadInventory()) {
    if (row.return_rate_pct > RETURN_SPIKE_THRESHOLD_PCT) {
      flagReturnSpike(row.sku_id);
      spikes++;
    }

    if (AGENT1_MARKER.test(row.notes)) {
      const approved = /agent 1 approved/i.test(row.notes);
      logListingDecision({
        sku_id: row.sku_id,
        product_name: row.product_name,
        product_category: row.product_category,
        decision: approved ? 'approved' : 'auto-blocked',
        confidence: 'high',
        reason: approved
          ? 'Listing claims are supported by the product specification.'
          : 'Listing claims are not supported by the product specification.',
      });
      decisions++;
    }
  }

  if (!quiet) {
    console.log(
      `  seeded ${spikes} return spikes and ${decisions} listing decisions ` +
        `(standing in for Agents 2 and 1)`
    );
  }

  return { spikes, decisions };
}
