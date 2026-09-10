import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DemoCustomer {
  complaint_id: string;
  customer_name: string;
  product_name: string;
  order_id: string;
  emotional_tone: string;
  seeded_message: string;
}

interface Message {
  from: 'customer' | 'support' | 'system';
  text: string;
  pending?: boolean;
}

/**
 * The customer side of the demo.
 *
 * A message is classified first. A question is answered immediately by the Q&A
 * sub-agent. A complaint is NOT answered — it goes into the review queue and
 * waits for a human in the portal to approve it, because Agent 2 holds real
 * refund authority. The customer sees that wait honestly.
 *
 * Resolution arrives over the SSE stream once a human approves, so this page
 * updates without polling.
 */
export function CustomerChat() {
  const [customers, setCustomers] = useState<DemoCustomer[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(`sess-${Math.random().toString(36).slice(2, 10)}`);
  const scrollRef = useRef<HTMLDivElement>(null);

  const customer = customers.find((c) => c.complaint_id === customerId);

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((list: DemoCustomer[]) => {
        setCustomers(list);
        if (list[0]) setCustomerId(list[0].complaint_id);
      })
      .catch(() => {});
  }, []);

  // Greet whenever the selected customer changes, and pre-fill their complaint
  // so the demo is one keystroke rather than a paragraph of typing on stage.
  useEffect(() => {
    if (!customer) return;
    setMessages([
      {
        from: 'support',
        text: `Hi ${customer.customer_name.split(' ')[0]}. You're chatting with Cosmic Mart support about your ${customer.product_name}. How can I help?`,
      },
    ]);
    setDraft(customer.seeded_message ?? '');
  }, [customerId, customers.length]);

  // Live resolution from the portal.
  useEffect(() => {
    const es = new EventSource(`/api/events?sessionId=${sessionId.current}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'chatResolution') {
          setMessages((m) => [
            ...m.filter((x) => !x.pending),
            { from: 'system', text: `A human reviewer ${data.verdict} this case.` },
            { from: 'support', text: data.response },
          ]);
        }
      } catch {
        /* ignore keep-alives */
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || !customerId || busy) return;

    setMessages((m) => [...m, { from: 'customer', text }]);
    setDraft('');
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current, customerId, message: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((m) => [...m, { from: 'system', text: data.error ?? 'Something went wrong.' }]);
      } else if (data.type === 'question') {
        setMessages((m) => [...m, { from: 'support', text: data.response }]);
      } else {
        setMessages((m) => [
          ...m,
          {
            from: 'system',
            text:
              'This looks like a complaint, so it has gone to a human reviewer before any refund is issued. Waiting for approval…',
            pending: true,
          },
        ]);
      }
    } catch (e) {
      setMessages((m) => [...m, { from: 'system', text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" />
          Back to store
        </Link>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <span className="grid size-9 place-items-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                C
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Cosmic Mart Support</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  Online
                </div>
              </div>
              {customer && (
                <Badge variant="secondary" className="text-[11px]">
                  {customer.emotional_tone}
                </Badge>
              )}
            </div>

            {/* Who am I */}
            <div className="flex items-center gap-3 border-b bg-muted/40 px-5 py-3">
              <span className="shrink-0 text-xs text-muted-foreground">Demo customer</span>
              <Select value={customerId} onValueChange={(v) => v && setCustomerId(v)}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue placeholder="Pick a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.complaint_id} value={c.complaint_id} className="text-xs">
                      {c.customer_name} — {c.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="h-[420px] space-y-3 overflow-y-auto px-5 py-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.from === 'customer' ? 'flex justify-end' : 'flex justify-start'}
                >
                  {m.from === 'system' ? (
                    <div className="flex w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                      {m.pending && <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />}
                      {!m.pending && <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />}
                      <span>{m.text}</span>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.from === 'customer'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.text}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Composer */}
            <div className="flex items-center gap-2 border-t px-4 py-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Type your message…"
                className="flex-1"
              />
              <Button onClick={send} disabled={busy || !draft.trim()} size="icon" className="shrink-0">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Complaints require human approval before any refund. Approve them in the{' '}
          <Link to="/dashboard" className="underline">
            employee portal
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
