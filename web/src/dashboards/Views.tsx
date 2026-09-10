import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardCheck,
  Gift,
  Leaf,
  MessageSquare,
  Package,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AreaPlot } from '@/components/AreaPlot';
import { Empty, Panel, Stat } from '@/components/Panel';
import { DecisionThread } from '@/components/DecisionThread';
import { AgentChat } from '@/components/AgentChat';
import { QueueItem } from '@/components/QueueItem';
import { ResolvedItem } from '@/components/ResolvedItem';
import { money, PROFILES, ROLES } from '@/lib/data';
import {
  ACTIVITY,
  BRIEF,
  LISTING_OUTCOMES,
  NEXUS,
  RECOVERY,
  RESOLUTIONS,
} from '@/lib/demoSeries';
import { useEffect, useState } from 'react';
import { derive } from '@/lib/useSharedState';
import { getCatalog, getReviewCards, resolveReview, runAgent1, runAgent3 } from '@/lib/api';
import type { ReviewCard } from '@/lib/api';
import type { Product, SharedState } from '@/lib/types';

export type ViewKey =
  | 'overview'
  | 'signals'
  | 'trustgate'
  | 'cosmiccare'
  | 'deadstock'
  | 'queue'
  | 'brief'
  | 'staff';

interface ViewProps {
  state: SharedState;
  reload: () => void;
}

const RISK_TONE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

const DECISION_TONE: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  escalate: 'bg-amber-100 text-amber-700',
  'auto-blocked': 'bg-red-100 text-red-700',
};

function ActionTile({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof Package;
  label: string;
  count: number;
}) {
  return (
    <button className="group relative flex flex-col justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent">
      <Icon className="size-5 text-muted-foreground" />
      <ArrowUpRight className="absolute right-3 top-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="mt-6">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-lg font-semibold tabular-nums">{count}</div>
      </div>
    </button>
  );
}

function IdleNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="text-amber-900">
        <p className="font-medium">No agent has run in this session yet.</p>
        <p className="mt-0.5 text-amber-800">
          Panels marked <span className="font-medium">live</span> read from agent shared state, so
          they stay empty until an agent writes something. Use the customer chat, or add the agent
          endpoints to the server, and these fill in.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

export function Overview({ state, reload }: ViewProps) {
  const d = derive(state);

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="All agents / live session"
        title="Action board"
        source="live"
        action={
          <Button variant="ghost" size="sm" onClick={reload}>
            <RefreshCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Awaiting a human" value={String(d.pendingReviews.length)} hint="listings and refunds" />
          <Stat label="Listings actioned" value={String(state.listingDecisions.length)} hint={`${d.blocked.length} not approved`} />
          <Stat label="Refunds issued" value={money(d.refunded)} hint={`${state.actions.length} actions`} />
          <Stat label="Routed to donation" value={String(d.donations.length)} hint="Cosmic Nexus" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionTile icon={ClipboardCheck} label="Review listings" count={d.blocked.length} />
          <ActionTile icon={MessageSquare} label="Approve refunds" count={d.pendingReviews.length} />
          <ActionTile icon={Package} label="Triage inventory" count={d.spikeCount} />
          <ActionTile icon={Gift} label="Cosmic Nexus" count={d.donations.length} />
        </div>

        {d.idle && <div className="mt-6">{<IdleNotice />}</div>}
      </Panel>

      <Panel eyebrow="Trailing 7 days" title="Agent activity" source="illustrative">
        <AreaPlot
          data={ACTIVITY}
          height={300}
          config={{
            trustgate: { label: 'TrustGate', color: 'var(--chart-1)' },
            cosmiccare: { label: 'CosmicCare', color: 'var(--chart-2)' },
            deadstock: { label: 'DeadStock Zero', color: 'var(--chart-3)' },
          }}
        />
      </Panel>

      <SignalFlow state={state} reload={reload} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Signal flow
 * ------------------------------------------------------------------ */

export function SignalFlow({ state, reload }: ViewProps) {
  const connections = [
    { from: 'CosmicCare', to: 'TrustGate', what: 'complaint patterns raise listing scrutiny', key: 'agent2->agent1' },
    { from: 'CosmicCare', to: 'DeadStock Zero', what: 'return spikes force donation over discount', key: 'agent2->agent3' },
    { from: 'TrustGate', to: 'DeadStock Zero', what: 'listing decisions explain weak demand', key: 'agent1->agent3' },
    { from: 'DeadStock Zero', to: 'CosmicCare', what: 'stock leaving withdraws replacement offers', key: 'agent3->agent2' },
  ];

  return (
    <Panel
      eyebrow="Agent intelligence"
      title="Signal flow"
      source="live"
      action={
        <Button variant="ghost" size="sm" onClick={reload}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {connections.map((c) => {
          const n = state.connections[c.key] ?? 0;
          return (
            <div key={c.key} className="flex items-start gap-3 rounded-lg border p-3.5">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${n > 0 ? 'bg-green-500' : 'bg-neutral-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {c.from} <span className="text-muted-foreground">→</span> {c.to}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{c.what}</div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{n}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Each count is how many signals that agent has written to shared state this session. Four
        live connections is what makes this a system rather than three separate tools.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * TrustGate
 * ------------------------------------------------------------------ */

export function TrustGateView({ state }: ViewProps) {
  const d = derive(state);
  const approved = state.listingDecisions.filter((x) => x.decision === 'approved').length;

  return (
    <div className="space-y-6">
      <Panel eyebrow="Agent 1" title="TrustGate · listings" source="live">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="Assessed" value={String(state.listingDecisions.length)} hint="this session" />
          <Stat label="Approved" value={String(approved)} />
          <Stat label="Held or blocked" value={String(d.blocked.length)} hint="awaiting a human" />
        </div>
        <Separator className="my-5" />
        {state.listingDecisions.length === 0 ? (
          <Empty>No listings assessed yet</Empty>
        ) : (
          <ul className="divide-y">
            {state.listingDecisions.slice().reverse().map((x, i) => (
              <li key={i} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {x.product_name ?? x.sku_id}
                  </span>
                  <Badge variant="secondary" className={`shrink-0 text-[11px] ${DECISION_TONE[x.decision] ?? ''}`}>
                    {x.decision}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{x.reason}</p>
                <DecisionThread
                  agent="agent1"
                  skuId={x.sku_id}
                  suggestions={[
                    'Why did you not approve this listing?',
                    'Which specific claim is unsupported?',
                    'What would the seller need to provide to pass?',
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel eyebrow="Trailing 6 weeks" title="Listing outcomes" source="illustrative">
        <AreaPlot
          data={LISTING_OUTCOMES}
          height={300}
          config={{
            approved: { label: 'Approved', color: 'var(--chart-2)' },
            escalated: { label: 'Escalated', color: 'var(--chart-4)' },
            blocked: { label: 'Blocked', color: 'var(--chart-5)' },
          }}
        />
      </Panel>

      <Panel eyebrow="Review" title="Talk to TrustGate" source="live">
        <AgentChat
          agent="agent1"
          skuId={state.listingDecisions.at(-1)?.sku_id}
          starters={[
            'Which listings need my attention?',
            'Why did you block the last one?',
            'Has CosmicCare seen complaints on it?',
          ]}
        />
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * CosmicCare
 * ------------------------------------------------------------------ */

export function CosmicCareView({ state }: ViewProps) {
  const d = derive(state);

  return (
    <div className="space-y-6">
      <Panel eyebrow="Agent 2" title="CosmicCare · complaints" source="live">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="Patterns tagged" value={String(state.complaintPatterns.length)} hint="fed back to TrustGate" />
          <Stat label="Refunds issued" value={money(d.refunded)} hint={`${state.actions.length} actions`} />
          <Stat label="Return spikes raised" value={String(d.spikeCount)} hint="sent to DeadStock Zero" />
        </div>
        <Separator className="my-5" />
        {state.complaintPatterns.length === 0 ? (
          <Empty>No complaints resolved yet</Empty>
        ) : (
          <ul className="divide-y">
            {state.complaintPatterns.slice().reverse().map((p, i) => (
              <li key={i} className="py-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{p.sku_id}</span>
                  <span className="flex-1 truncate">{p.complaint_pattern_tag}</span>
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {p.product_category}
                  </Badge>
                </div>
                <DecisionThread
                  agent="agent2"
                  skuId={p.sku_id}
                  suggestions={[
                    'Why did you choose a refund here?',
                    'Why tag it this way?',
                    'Was a replacement an option?',
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel eyebrow="Trailing 6 weeks" title="How complaints were resolved" source="illustrative">
        <AreaPlot
          data={RESOLUTIONS}
          height={300}
          config={{
            refund: { label: 'Refund', color: 'var(--chart-1)' },
            replacement: { label: 'Replacement', color: 'var(--chart-2)' },
            waiver: { label: 'Fee waiver', color: 'var(--chart-3)' },
          }}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Replacements fall as DeadStock Zero withdraws stock routed to donation — the fourth
          connection, visible as a trend.
        </p>
      </Panel>

      <Panel eyebrow="Review" title="Talk to CosmicCare" source="live">
        <AgentChat
          agent="agent2"
          skuId={state.complaintPatterns.at(-1)?.sku_id}
          starters={[
            'What did you refund and why?',
            'Can I still offer a replacement on that SKU?',
            'Was the listing actually misleading?',
          ]}
        />
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * DeadStock Zero
 * ------------------------------------------------------------------ */

export function DeadStockView({ state }: ViewProps) {
  const d = derive(state);

  return (
    <div className="space-y-6">
      <Panel eyebrow="Agent 3" title="DeadStock Zero · stock" source="live">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="SKUs triaged" value={String(state.inventoryAdvisories.length)} hint="this session" />
          <Stat label="Routed to donation" value={String(d.donations.length)} hint="Cosmic Nexus" />
          <Stat label="Replacements withdrawn" value={String(d.donations.length)} hint="advisory to CosmicCare" />
        </div>
        <Separator className="my-5" />
        {state.inventoryAdvisories.length === 0 ? (
          <Empty>No inventory triaged yet</Empty>
        ) : (
          <ul className="divide-y">
            {state.inventoryAdvisories.slice().reverse().map((a, i) => (
              <li key={i} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium">{a.sku_id}</span>
                  <Badge variant="secondary" className={`shrink-0 text-[11px] ${RISK_TONE[a.risk_level] ?? ''}`}>
                    {a.risk_level}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.intervention} — {a.note}</p>
                <DecisionThread
                  agent="agent3"
                  skuId={a.sku_id}
                  suggestions={[
                    'Why this intervention over repricing?',
                    'What did the other agents tell you?',
                    'What happens if we do nothing?',
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel eyebrow="Trailing 6 weeks" title="Value recovered by intervention" source="illustrative">
        <AreaPlot
          data={RECOVERY}
          height={300}
          compact
          currency
          config={{
            reprice: { label: 'Reprice', color: 'var(--chart-1)' },
            redistribute: { label: 'Redistribute', color: 'var(--chart-2)' },
            donation: { label: 'Cosmic Nexus', color: 'var(--chart-3)' },
          }}
        />
      </Panel>

      <Panel eyebrow="Review" title="Talk to DeadStock Zero" source="live">
        <AgentChat
          agent="agent3"
          skuId={state.inventoryAdvisories.at(-1)?.sku_id}
          starters={[
            'What should I action this week?',
            'Why donate rather than discount?',
            'What did TrustGate say about that listing?',
          ]}
        />
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Review queue
 * ------------------------------------------------------------------ */

export function QueueView({ state, reload }: ViewProps) {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function loadCards() {
    try {
      setCards(await getReviewCards());
    } catch {
      /* the panel still renders from shared state */
    }
  }

  useEffect(() => {
    loadCards();
    getCatalog().then(setCatalog).catch(() => {});
    const t = setInterval(loadCards, 3000);
    return () => clearInterval(t);
  }, []);

  /**
   * Approving is what lets Agent 2 spend money, so it happens here and nowhere
   * else. Once Agent 2 has flagged a return spike we run Agent 3 on the same
   * SKU straight away - that handoff is the thing worth watching.
   */
  async function decide(card: ReviewCard, verdict: 'approved' | 'rejected') {
    setBusy(card.reviewId);
    setNote(null);
    try {
      await resolveReview(card.reviewId, verdict);
      if (verdict === 'approved' && card.sku_id) {
        setNote('Agent 2 resolved ' + card.sku_id + '. Handing off to DeadStock Zero...');
        const a3 = await runAgent3(card.sku_id);
        setNote(
          'Agent 2 to Agent 3 handoff complete: ' +
            card.sku_id +
            ' -> ' +
            a3.result.intervention +
            ' (' +
            a3.result.risk_level +
            ' risk).'
        );
      }
      await Promise.all([loadCards(), reload()]);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pending = cards.filter((c) => c.status === 'pending');
  const done = cards.filter((c) => c.status !== 'pending');

  return (
    <div className="space-y-6">
      <Panel eyebrow="Human in the loop" title="Review queue" source="live">
        <p className="text-sm text-muted-foreground">
          A complaint reaches CosmicCare, which holds the {money(500)} refund authority, only after
          a human approves it here. The gate is enforced in{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">server.js</code>, in the function,
          not in a prompt.
        </p>

        {note && <div className="mt-4 rounded-lg border bg-muted/50 p-3 text-sm">{note}</div>}

        <Separator className="my-5" />

        {pending.length === 0 ? (
          <Empty>Nothing waiting. Raise a complaint in the customer chat and it appears here.</Empty>
        ) : (
          <ul className="space-y-3">
            {pending.map((c) => (
              <QueueItem
                key={c.reviewId}
                card={c}
                product={catalog.find((p) => p.sku_id === c.sku_id)}
                state={state}
                busy={busy === c.reviewId}
                onDecide={(verdict) => decide(c, verdict)}
              />
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <>
            <Separator className="my-5" />
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-medium">Previously resolved</h4>
              <span className="text-xs text-muted-foreground">
                {done.length} closed {done.length === 1 ? 'case' : 'cases'}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {done
                .slice()
                .reverse()
                .map((c) => (
                  <ResolvedItem key={c.reviewId} card={c} state={state} />
                ))}
            </ul>
          </>
        )}
      </Panel>

      <AgentRunner state={state} reload={reload} />
    </div>
  );
}

/**
 * Manual agent triggers.
 *
 * Agent 2 runs when a human approves a complaint. Agents 1 and 3 have no such
 * natural trigger in the UI, so they get buttons - which is also how you show a
 * judge the handoff without waiting for a customer to complain.
 */
function AgentRunner({ reload }: ViewProps) {
  const [sku, setSku] = useState('SKU-1001');
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function run(which: 'agent1' | 'agent3') {
    setBusy(which);
    try {
      if (which === 'agent1') {
        const r = await runAgent1(sku);
        setLog((l) => ['TrustGate · ' + sku + ' -> ' + r.result.decision + ' - ' + r.result.reason, ...l]);
      } else {
        const r = await runAgent3(sku);
        const consulted = r.toolCalls.length ? ' · consulted ' + r.toolCalls.join(', ') : '';
        setLog((l) => [
          'DeadStock Zero · ' + sku + ' -> ' + r.result.intervention + ' (' + r.result.risk_level + ')' + consulted,
          ...l,
        ]);
      }
      await reload();
    } catch (e) {
      setLog((l) => [(e as Error).message, ...l]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel eyebrow="Operations" title="Run an agent" source="live">
      <p className="text-sm text-muted-foreground">
        Agents run in the server process, so whatever they write shows up in the panels above
        immediately.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          className="h-9 w-36 rounded-md border px-3 font-mono text-sm"
        />
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('agent1')}>
          {busy === 'agent1' ? 'Checking...' : 'Check listing (Agent 1)'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('agent3')}>
          {busy === 'agent3' ? 'Triaging...' : 'Triage stock (Agent 3)'}
        </Button>
      </div>
      {log.length > 0 && (
        <ul className="mt-4 space-y-2">
          {log.map((line, i) => (
            <li key={i} className="rounded-md bg-muted/50 p-2.5 font-mono text-xs leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Weekly brief
 * ------------------------------------------------------------------ */

export function BriefView() {
  return (
    <div className="space-y-6">
      <Panel eyebrow="Leadership summary" title="Weekly brief" source="illustrative">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Listings reviewed" value={String(BRIEF.listingsReviewed)} hint={`${BRIEF.listingsBlocked} blocked`} />
          <Stat label="Complaints resolved" value={String(BRIEF.complaintsResolved)} hint={`${BRIEF.avgResolutionSeconds}s average`} />
          <Stat label="Margin recovered" value={money(BRIEF.marginRecovered)} />
          <Stat label="Units diverted" value={BRIEF.unitsDiverted.toLocaleString()} hint={`${BRIEF.co2SavedKg} kg CO₂ saved`} />
        </div>
        <Separator className="my-5" />
        <p className="text-sm leading-relaxed">
          This week CosmicTrust reviewed {BRIEF.listingsReviewed} product listings, blocking{' '}
          {BRIEF.listingsBlocked} with unverified claims before they reached customers. CosmicCare
          resolved {BRIEF.complaintsResolved} complaints at an average of{' '}
          {BRIEF.avgResolutionSeconds} seconds. DeadStock Zero recovered{' '}
          {money(BRIEF.marginRecovered)} in margin and diverted{' '}
          {BRIEF.unitsDiverted.toLocaleString()} units from landfill through Cosmic Nexus
          donations, saving roughly {BRIEF.co2SavedKg} kg of CO₂.
        </p>
      </Panel>

      <Panel eyebrow="Cumulative" title="Cosmic Nexus impact" source="illustrative">
        <AreaPlot
          data={NEXUS}
          height={300}
          config={{
            units: { label: 'Units diverted', color: 'var(--chart-2)' },
            co2: { label: 'CO₂ saved (kg)', color: 'var(--chart-3)' },
          }}
        />
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Leaf className="size-3.5" />
          The Cosmic Nexus donation programme already existed at Cosmic Mart and sat unused. This
          activates it.
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Staff & roles
 * ------------------------------------------------------------------ */

export function StaffView() {
  return (
    <Panel eyebrow="Administration" title="Staff & roles">
      <ul className="divide-y">
        {PROFILES.map((p) => (
          <li key={p.email} className="flex items-center gap-3 py-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${p.colour}`}>
              {p.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">{p.email}</div>
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-sm">{ROLES[p.role].label}</div>
              <div className="text-xs text-muted-foreground">{ROLES[p.role].agent}</div>
            </div>
          </li>
        ))}
      </ul>
      <Card className="mt-5 border-dashed shadow-none">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Roles are carried over from the original portal. Signing in as one of these accounts
          changes which agent panels appear in the sidebar — there is no separate admin URL.
        </CardContent>
      </Card>
    </Panel>
  );
}
