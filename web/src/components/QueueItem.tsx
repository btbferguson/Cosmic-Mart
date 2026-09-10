import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Loader2,
  Package,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DecisionThread } from '@/components/DecisionThread';
import { money } from '@/lib/data';
import type { ReviewCard } from '@/lib/api';
import type { Product, SharedState } from '@/lib/types';

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
 * One item in the review queue.
 *
 * Collapsed it is a single line, because a reviewer scanning a queue wants
 * density. Expanded it shows everything needed to decide without leaving the
 * page: the customer, the complaint verbatim, the SKU's position, the
 * specification set against the marketing claims, and what the other agents
 * already know.
 *
 * The specification-versus-claims block is the important one. That contradiction
 * is usually the whole reason the complaint exists, and reading them side by
 * side is faster than any summary of them.
 */
export function QueueItem({
  card,
  product,
  state,
  busy,
  onDecide,
}: {
  card: ReviewCard;
  product?: Product;
  state: SharedState;
  busy: boolean;
  onDecide: (verdict: 'approved' | 'rejected') => void;
}) {
  const [open, setOpen] = useState(false);

  const sku = card.sku_id;
  const decision = sku
    ? [...state.listingDecisions].reverse().find((d) => d.sku_id === sku)
    : undefined;
  const advisory = sku
    ? [...state.inventoryAdvisories].reverse().find((a) => a.sku_id === sku)
    : undefined;
  const patterns = sku ? state.complaintPatterns.filter((p) => p.sku_id === sku) : [];
  const spiked = sku ? Boolean(state.returnSpikes[sku]) : false;

  return (
    <li className="rounded-lg border">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {card.customer_name} · {card.product_name ?? sku}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{card.reviewId}</span>
            {product && <span>{money(product.price)}</span>}
            {!open && card.complaint_description && (
              <span className="truncate">· {card.complaint_description}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {card.emotional_tone && (
            <Badge variant="secondary" className="text-[11px]">
              {card.emotional_tone}
            </Badge>
          )}
          {card.predicted_tag && (
            <Badge variant="secondary" className="text-[11px]">
              {card.predicted_tag}
            </Badge>
          )}
          {spiked && (
            <Badge variant="secondary" className="bg-red-100 text-[11px] text-red-700">
              return spike
            </Badge>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Customer side */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="size-3.5" />
                CUSTOMER
              </div>
              <Field label="What they said">
                {card.complaint_description ?? 'no message on record'}
              </Field>
              {card.customer_history && (
                <Field label="Relationship">{card.customer_history}</Field>
              )}
              <Field label="Classifier read this as">
                {card.predicted_tag ?? 'unclassified'}{' '}
                <span className="text-muted-foreground">
                  · tone {card.emotional_tone ?? 'unknown'}
                </span>
              </Field>
            </div>

            {/* Product side */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Package className="size-3.5" />
                PRODUCT {sku && <span className="font-mono">· {sku}</span>}
              </div>

              {product ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Price </span>
                      {money(product.price)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Competitor </span>
                      {money(product.competitor_price)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category </span>
                      {product.product_category}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stock </span>
                      {product.in_stock ? 'available' : 'none'}
                    </div>
                  </div>

                  {/* The contradiction, side by side. */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-800">
                      <AlertTriangle className="size-3.5" />
                      Claims vs specification
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">
                      <span className="font-medium">Listing claims: </span>
                      {product.claims || 'none'}
                    </p>
                    <Separator className="my-2 bg-amber-200" />
                    <p className="text-xs leading-relaxed">
                      <span className="font-medium">Specification: </span>
                      {product.specs || 'none on file'}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No catalogue entry found for {sku}.
                </p>
              )}
            </div>
          </div>

          {/* What the agents already know */}
          <Separator className="my-4" />
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="size-3.5" />
            WHAT THE AGENTS ALREADY KNOW
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex gap-2">
              <span className="text-muted-foreground">TrustGate</span>
              <span>
                {decision
                  ? `${decision.decision} — ${decision.reason}`
                  : 'has not assessed this listing'}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">CosmicCare</span>
              <span>
                {patterns.length
                  ? `tagged ${patterns.map((p) => p.complaint_pattern_tag).join(', ')}`
                  : 'no complaints resolved for this SKU yet'}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">DeadStock</span>
              <span>
                {advisory
                  ? `${advisory.intervention}${advisory.replacements_available ? '' : ' — replacements withdrawn'}`
                  : 'has not triaged this SKU'}
              </span>
            </li>
          </ul>

          {sku && (
            <DecisionThread
              agent="agent2"
              skuId={sku}
              suggestions={[
                'Should I approve this?',
                'What would you do and why?',
                'Can we still offer a replacement?',
              ]}
            />
          )}

          {/* Decide */}
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => onDecide('approved')}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Working…
                </>
              ) : (
                <>
                  <CircleDollarSign className="mr-1.5 size-3.5" />
                  Approve — let CosmicCare resolve
                </>
              )}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide('rejected')}>
              Reject
            </Button>
            <span className="text-xs text-muted-foreground">
              Approving lets the agent spend up to {money(500)} without further sign-off.
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
