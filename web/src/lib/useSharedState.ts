import { useCallback, useEffect, useState } from 'react';
import { getState } from './api';
import type { SharedState } from './types';

/**
 * Poll GET /api/state.
 *
 * The agents write to shared state as they run, so a one-shot fetch would show
 * a snapshot that silently goes stale mid-demo. Four seconds is frequent enough
 * to feel live and cheap enough to ignore.
 */
export function useSharedState() {
  const [state, setState] = useState<SharedState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getState());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);

  return { state, error, reload: load };
}

/** Figures derived from live state, shared by several views. */
export function derive(state: SharedState) {
  return {
    pendingReviews: state.reviewQueue.filter((r) => r.status === 'pending'),
    blocked: state.listingDecisions.filter((d) => d.decision !== 'approved'),
    donations: state.inventoryAdvisories.filter((a) => !a.replacements_available),
    refunded: state.actions.reduce((sum, a) => sum + (a.amount ?? 0), 0),
    spikeCount: Object.values(state.returnSpikes).filter(Boolean).length,
    idle:
      state.listingDecisions.length === 0 &&
      state.complaintPatterns.length === 0 &&
      state.inventoryAdvisories.length === 0,
  };
}
