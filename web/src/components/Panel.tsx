import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Every dashboard panel says where its numbers come from.
 *
 * "Live" means read from agent shared state this session. "Illustrative" means
 * a plausible baseline, because the agents have no history to chart yet. A
 * judge asking "is this real data?" should get the answer from the screen
 * rather than from whoever is presenting.
 */
export function Panel({
  title,
  eyebrow,
  source,
  action,
  children,
  id,
}: {
  title: string;
  eyebrow?: string;
  source?: 'live' | 'illustrative';
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card id={id}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
              {title}
              {source === 'live' && (
                <Badge variant="secondary" className="gap-1.5 bg-green-100 text-[11px] text-green-700">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  live
                </Badge>
              )}
              {source === 'illustrative' && (
                <Badge variant="secondary" className="text-[11px]">
                  illustrative
                </Badge>
              )}
            </h3>
          </div>
          {action}
        </div>
        <div className="mt-5">{children}</div>
      </CardContent>
    </Card>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
