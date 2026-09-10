import { useState } from 'react';
import { CornerDownLeft, Loader2, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { askAgent } from '@/lib/api';

interface Turn {
  from: 'reviewer' | 'agent';
  text: string;
}

/**
 * Ask an agent why it decided something.
 *
 * Collapsed by default — a reviewer working through a queue does not want a
 * chat box on every row. Expanding offers the questions people actually ask,
 * because a blank prompt in a work tool is a dead end.
 *
 * Explaining is read-only: it never re-runs the agent, changes the decision, or
 * spends money.
 */
export function DecisionThread({
  agent,
  skuId,
  suggestions,
}: {
  agent: 'agent1' | 'agent2' | 'agent3';
  skuId: string;
  suggestions?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const prompts = suggestions ?? [
    'Why did you decide this?',
    'What evidence would change your mind?',
    'What is the risk if we ignore this?',
  ];

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setTurns((t) => [...t, { from: 'reviewer', text: q }]);
    setDraft('');
    setBusy(true);
    try {
      const { answer } = await askAgent(agent, skuId, q);
      setTurns((t) => [...t, { from: 'agent', text: answer }]);
    } catch (e) {
      setTurns((t) => [...t, { from: 'agent', text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <MessageCircleQuestion className="size-3.5" />
        Ask this agent why
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {prompts.map((p) => (
            <button
              key={p}
              onClick={() => ask(p)}
              className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <ul className="space-y-2.5">
          {turns.map((t, i) => (
            <li key={i} className="text-xs leading-relaxed">
              <span
                className={
                  t.from === 'reviewer'
                    ? 'font-medium text-foreground'
                    : 'font-medium text-muted-foreground'
                }
              >
                {t.from === 'reviewer' ? 'You' : 'Agent'}
              </span>
              <p className={t.from === 'agent' ? 'mt-0.5 text-foreground' : 'mt-0.5 text-muted-foreground'}>
                {t.text}
              </p>
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              thinking…
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a follow-up…"
          className="h-8 flex-1 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={busy || !draft.trim()} onClick={() => ask(draft)}>
          <CornerDownLeft className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
