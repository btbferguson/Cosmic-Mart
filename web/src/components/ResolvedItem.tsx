import { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Package,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DecisionThread } from '@/components/DecisionThread';
import type { ReviewCard } from '@/lib/api';
import type { SharedState } from '@/lib/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * A closed case, kept on the page rather than thrown away.
 *
 * Expanded it answers the question a reviewer actually has about a past
 * decision: what did the agent do, what did the customer get told, and what did
 * that set in motion downstream. The audit trail matters more than the tick.
 */
export function ResolvedItem({
  card,
  state,
}: {
  card: ReviewCard;
  state: SharedState;
}) {
  const [open, setOpen] = useState(false);

  const sku = card.sku_id;
  const resolution = card.resolution;
  const rejected = card.status === 'rejected';

  // What this resolution set off elsewhere.
  const spiked = sku ? Boolean(state.returnSpikes[sku]) : false;
  const advisory = sku
    ? [...state.inventoryAdvisories].reverse().find((a) => a.sku_id === sku)
    : undefined;
  const action = sku
    ? [...state.actions].reverse().find((a) => a.sku_id === sku)
    : undefined;

  return (
    <li className="rounded-lg border bg-muted/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-xs text-muted-foreground">{card.reviewId}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {card.customer_name} · {card.product_name ?? sku}
        </span>
        {!open && resolution?.action_taken && (
          <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground lg:block">
            {resolution.action_taken}
          </span>
        )}
        <Badge
          variant="secondary"
          className={rejected ? 'text-[11px]' : 'bg-green-100 text-[11px] text-green-700'}
        >
          {card.status}
        </Badge>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="What the customer said">
                {card.complaint_description ?? 'no message on record'}
              </Field>

              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <UserCheck className="size-3.5" />
                HUMAN VERDICT
              </div>
              <p className="text-sm">
                {rejected
                  ? 'A reviewer rejected this, so CosmicCare was never invoked and no money moved.'
                  : 'A reviewer approved this, which authorised CosmicCare to act.'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare className="size-3.5" />
                WHAT COSMICCARE DID
              </div>

              {resolution ? (
                <>
                  <Field label="Action taken">{resolution.action_taken}</Field>
                  <Field label="Reply sent to the customer">
                    <span className="text-muted-foreground">
                      {resolution.response_to_customer}
                    </span>
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    {resolution.complaint_pattern_tag && (
                      <Badge variant="secondary" className="text-[11px]">
                        tagged {resolution.complaint_pattern_tag}
                      </Badge>
                    )}
                    {resolution.escalate_to_human && (
                      <Badge variant="secondary" className="bg-amber-100 text-[11px] text-amber-800">
                        escalated to a human
                      </Badge>
                    )}
                    {action?.amount != null && (
                      <Badge variant="secondary" className="text-[11px]">
                        ${action.amount}
                      </Badge>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {rejected
                    ? 'No agent action — rejected before CosmicCare ran.'
                    : 'No resolution recorded.'}
                </p>
              )}
            </div>
          </div>

          {/* What this set off elsewhere. */}
          {!rejected && (
            <>
              <Separator className="my-4" />
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Package className="size-3.5" />
                WHAT THIS SET IN MOTION
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {resolution?.complaint_pattern_tag && (
                  <li className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="text-muted-foreground">To TrustGate: </span>
                      complaint pattern “{resolution.complaint_pattern_tag}” logged, raising
                      scrutiny on this category
                    </span>
                  </li>
                )}
                {spiked && (
                  <li className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="text-muted-foreground">To DeadStock Zero: </span>
                      return spike flagged on {sku}
                    </span>
                  </li>
                )}
                {advisory && (
                  <li className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="text-muted-foreground">DeadStock Zero responded: </span>
                      {advisory.intervention}
                      {!advisory.replacements_available && ', replacements withdrawn'}
                    </span>
                  </li>
                )}
                {!resolution?.complaint_pattern_tag && !spiked && !advisory && (
                  <li className="text-muted-foreground">Nothing downstream recorded.</li>
                )}
              </ul>
            </>
          )}

          {sku && (
            <DecisionThread
              agent="agent2"
              skuId={sku}
              suggestions={[
                'Was this the right call?',
                'Why this action and not a replacement?',
                'What did this change for the other agents?',
              ]}
            />
          )}
        </div>
      )}
    </li>
  );
}
