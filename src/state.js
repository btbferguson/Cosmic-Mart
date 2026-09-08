/**
 * The shared state all three agents read from and write to.
 *
 * This object IS the demo. Three agents that each answer a prompt is a
 * workflow; three agents that change each other's behaviour through shared
 * signals is a system. The UI puts this on screen so judges can watch the loop
 * close in real time.
 *
 * In-memory only - it lives for the length of one demo session. Swapping this
 * for Redis or Postgres is the obvious production step, and worth saying out
 * loud in Q&A.
 */

const listeners = new Set();

export const sharedState = {
  /** Written by Agent 2, read by Agent 1. Where trust broke, by category. */
  complaintPatternLog: [],

  /** Written by Agent 2, read by Agent 3. SKUs customers are sending back. */
  returnSpikeFlags: {},

  /** Written by Agent 1. Audit trail, and a demand signal for Agent 3. */
  listingDecisionLog: [],

  /** Written by Agent 1 on escalate. The human reviewer's inbox. */
  reviewQueue: [],

  /** Written by the tools Agent 2 calls. Proof the agent did something real. */
  actionLedger: [],
};

/* ------------------------------------------------------------------ *
 * Change notification - drives the live UI panel
 * ------------------------------------------------------------------ */

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event) {
  for (const listener of listeners) {
    try {
      listener(event, sharedState);
    } catch (error) {
      console.error('[state] listener threw:', error.message);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Writers - use these instead of mutating sharedState directly, so the UI
 * always hears about it.
 * ------------------------------------------------------------------ */

const now = () => new Date().toISOString();

/** Agent 2 -> Agent 1. A complaint pattern Agent 1 should get stricter about. */
export function logComplaintPattern({ complaint_pattern_tag, product_category, sku_id }) {
  const entry = { complaint_pattern_tag, product_category, sku_id, timestamp: now() };
  sharedState.complaintPatternLog.push(entry);
  emit({ type: 'complaintPattern', entry });
  return entry;
}

/** Agent 2 -> Agent 3. This SKU is coming back; do not just discount it. */
export function flagReturnSpike(skuId, flagged = true) {
  sharedState.returnSpikeFlags[skuId] = flagged;
  emit({ type: 'returnSpike', skuId, flagged });
}

/** Agent 1 -> audit + Agent 3. What we decided about a listing and why. */
export function logListingDecision(entry) {
  const record = { ...entry, timestamp: now() };
  sharedState.listingDecisionLog.push(record);
  emit({ type: 'listingDecision', entry: record });
  return record;
}

/** Agent 1 -> human. Anything the agent will not decide on its own. */
export function enqueueForReview(item) {
  const record = {
    id: 'REV-' + (sharedState.reviewQueue.length + 1),
    status: 'pending',
    ...item,
    timestamp: now(),
  };
  sharedState.reviewQueue.push(record);
  emit({ type: 'reviewQueued', entry: record });
  return record;
}

/** The human reviewer's verdict. The agent recommends; a person decides. */
export function resolveReview(id, verdict) {
  const item = sharedState.reviewQueue.find((entry) => entry.id === id);
  if (!item) throw new Error('No review item ' + id);
  item.status = verdict; // 'approved' | 'kept-blocked'
  item.resolvedAt = now();
  emit({ type: 'reviewResolved', entry: item });
  return item;
}

/** Agent 2's tools -> ledger. Every real-world action the system took. */
export function recordAction(action) {
  const record = { ...action, timestamp: now() };
  sharedState.actionLedger.push(record);
  emit({ type: 'action', entry: record });
  return record;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * Recent complaint patterns for one category. This is exactly what Agent 1
 * gets fed on every listing assessment.
 */
export function complaintPatternsFor(category, limit = 10) {
  return sharedState.complaintPatternLog
    .filter((entry) => entry.product_category === category)
    .slice(-limit);
}

/** Has Agent 2 seen returns on this SKU? Agent 3 asks this. */
export function hasReturnSpike(skuId) {
  return Boolean(sharedState.returnSpikeFlags[skuId]);
}

export function snapshot() {
  return structuredClone(sharedState);
}

/** Wipe everything. Call before each demo run so we start from a known place. */
export function reset() {
  sharedState.complaintPatternLog = [];
  sharedState.returnSpikeFlags = {};
  sharedState.listingDecisionLog = [];
  sharedState.reviewQueue = [];
  sharedState.actionLedger = [];
  emit({ type: 'reset' });
}

/**
 * Hook for pre-loading state before a run.
 *
 * Deliberately empty. Whoever owns the demo data decides what goes in here -
 * the point is that agents can be exercised against a known starting state
 * instead of an empty one. Call reset() first if you fill this in.
 */
export function seed() {
  reset();
}
