import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { chatWithAgent } from '@/lib/api';
import type { Consultation } from '@/lib/api';

type AgentKey = 'agent1' | 'agent2' | 'agent3';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** Peers this agent consulted while answering. */
  consultations?: Consultation[];
}

const AGENT_LABEL: Record<AgentKey, string> = {
  agent1: 'TrustGate',
  agent2: 'CosmicCare',
  agent3: 'DeadStock Zero',
};

const PEER_LABEL: Record<string, string> = {
  agent1: 'TrustGate',
  agent2: 'CosmicCare',
  agent3: 'DeadStock Zero',
};

/**
 * A reviewer talking to the agent they supervise.
 *
 * The point of interest is the consultation strip: when the agent needs to know
 * what a peer decided, it asks, and that exchange is rendered inline. The
 * reviewer sees one agent consult another rather than being told it happened.
 */
export function AgentChat({
  agent,
  skuId,
  starters,
}: {
  agent: AgentKey;
  skuId?: string;
  starters?: string[];
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const prompts =
    starters ??
    [
      'What needs my attention right now?',
      'Why did you decide that?',
      'What did the other agents tell you?',
    ];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    const history = [...turns, { role: 'user' as const, content: q }];
    setTurns(history);
    setDraft('');
    setBusy(true);

    try {
      const res = await chatWithAgent(
        agent,
        history.map((t) => ({ role: t.role, content: t.content })),
        skuId
      );
      setTurns((t) => [
        ...t,
        { role: 'assistant', content: res.answer, consultations: res.consultations },
      ]);
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', content: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[520px] flex-col rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="grid size-7 place-items-center rounded-md bg-neutral-900 text-[11px] font-semibold text-white">
          {AGENT_LABEL[agent].slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{AGENT_LABEL[agent]}</div>
          <div className="truncate text-xs text-muted-foreground">
            {skuId ? `reviewing ${skuId}` : 'ready'}
          </div>
        </div>
        <Badge variant="secondary" className="gap-1.5 bg-green-100 text-[11px] text-green-700">
          <span className="size-1.5 rounded-full bg-green-500" />
          live
        </Badge>
      </div>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask {AGENT_LABEL[agent]} about its decisions. It can consult the other agents if the
              answer depends on what they know.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i}>
            {t.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-neutral-900 px-3.5 py-2.5 text-sm text-white">
                  {t.content}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Peer consultations happen before the answer, so show them first. */}
                {t.consultations && t.consultations.length > 0 && (
                  <ul className="space-y-1.5">
                    {t.consultations.map((c, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs"
                      >
                        <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="font-medium">
                            {AGENT_LABEL[agent]} asked {PEER_LABEL[c.consulted] ?? c.consulted}
                          </span>
                          <span className="mt-0.5 block text-muted-foreground">{c.summary}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                  {t.content}
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {AGENT_LABEL[agent]} is thinking, and may consult another agent…
          </div>
        )}
      </div>

      <Separator />
      <div className="flex items-center gap-2 px-3 py-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask ${AGENT_LABEL[agent]}…`}
          className="flex-1"
        />
        <Button size="icon" disabled={busy || !draft.trim()} onClick={() => send(draft)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
