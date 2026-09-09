/**
 * Terminal rendering for agent decisions.
 *
 * One card component, identical for all three agents - only the contents
 * differ. That uniformity is what will make three separate agents read as one
 * system on stage.
 *
 * Colour rule: risk level is the ONLY thing that carries colour. Interventions,
 * signals and metadata stay neutral. The moment intervention types get their own
 * colours the screen turns into confetti and the risk signal stops reading.
 */

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);

export const dim = (text) => paint('2', text);
export const bold = (text) => paint('1', text);

const RISK_COLOUR = { low: '32', medium: '33', high: '31' }; // green / yellow / red
export const risk = (level) => paint(RISK_COLOUR[level] ?? '0', level.toUpperCase());

export const WIDTH = 74;

/** Wrap text to a column width, preserving whole words. */
export function wrap(text, width = WIDTH - 6) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const money = (value) => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** The SKU header plus its hard numbers. */
export function renderHeader(sku) {
  const title = `${sku.sku_id} · ${sku.product_name}`;
  const pad = Math.max(1, WIDTH - title.length - sku.product_category.length - 4);
  const out = [];
  out.push('');
  out.push(`${bold(title)} ${dim('·'.repeat(pad))} ${dim(sku.product_category)}`);
  out.push(
    dim(
      `  stock ${sku.current_stock.toLocaleString()}   ` +
        `velocity ${sku.sales_velocity_weekly}/wk   ` +
        `supply ${sku.days_of_supply}d   ` +
        `returns ${sku.return_rate_pct}%   ` +
        `value ${money(sku.current_stock * sku.our_price)}`
    )
  );
  return out.join('\n');
}

/** The cross-agent signals, shown as chips. This is the "it's a system" moment. */
export function renderSignals(signals) {
  const chips = [];
  if (signals.return_spike_flag) chips.push('● return spike ← Agent 2');
  if (signals.listing_decision) {
    chips.push(`● listing ${signals.listing_decision.decision} ← Agent 1`);
  }
  if (chips.length === 0) chips.push(dim('no cross-agent signals'));
  return `  ${dim('signals')}   ${chips.join('   ')}`;
}

export function renderThinking(text, maxLines = 2) {
  const lines = wrap(text, WIDTH - 14).slice(0, maxLines);
  if (lines.length === 0) return '';
  const suffix = wrap(text, WIDTH - 14).length > maxLines ? '…' : '';
  return lines
    .map((line, i) => `  ${i === 0 ? dim('thinking') : '        '}  ${dim(line)}${i === lines.length - 1 ? suffix : ''}`)
    .join('\n');
}

export function renderToolCall(name, result) {
  const detail =
    result?.complaint_count != null
      ? `(${result.complaint_count})`
      : result?.error
        ? '(error)'
        : '';
  return `  ${dim('tool')}      ${dim('→')} ${name} ${dim(detail)}`;
}

/**
 * An agent consulting another agent. Rendered differently from a data lookup
 * on purpose - this is the line that shows the system is a system.
 */
export function renderAgentCall(name, result) {
  const who = name.includes('agent1') ? 'Agent 1' : 'Agent 2';
  let detail;
  if (result?.error) {
    detail = result.error.slice(0, 48).replace(/\s+$/, '') + '...';
  } else if (result?.decision) {
    detail = `${result.decision} - ${result.reason ?? ''}`.slice(0, 52);
  } else {
    detail = result?.summary ?? '';
  }
  return `  ${dim('consult')}   ${bold('⇄ ' + who)}  ${dim(detail)}`;
}

/** The decision card. Same shape for every agent. */
export function renderCard(decision) {
  const inner = WIDTH - 4;
  const top = `  ╭${'─'.repeat(inner)}╮`;
  const bottom = `  ╰${'─'.repeat(inner)}╯`;

  // Colour codes are zero-width on screen but not in .length, so pad manually.
  // Colour codes are zero-width on screen but not in .length, so every row is
  // padded from the PLAIN text and the colour is applied after.
  const row = (plain, painted = plain) =>
    `  │${painted}${' '.repeat(Math.max(0, inner - plain.length))}│`;

  const blank = row('');

  const label = `${decision.risk_level.toUpperCase()} RISK`;
  const headPlain = ` ${label}  ${decision.intervention} `;
  const gap = Math.max(1, inner - label.length - decision.intervention.length - 3);
  const head = row(
    ` ${label}${' '.repeat(gap)}${decision.intervention} `,
    ` ${risk(decision.risk_level)} RISK${' '.repeat(gap)}${bold(decision.intervention)} `
  );

  const lines = [top, head, blank];

  for (const line of wrap(decision.reason, inner - 4)) {
    lines.push(row(`  ${line}`));
  }

  lines.push(blank);

  for (const [i, line] of wrap(`recovery  ${decision.estimated_recovery}`, inner - 14).entries()) {
    const text = i === 0 ? `  ${line}` : `            ${line}`;
    lines.push(row(text, dim(text)));
  }

  if (decision.guardrail) {
    lines.push(blank);
    const note = `guardrail  model chose "${decision.guardrail.model_chose}", overridden`;
    for (const [i, line] of wrap(note, inner - 15).entries()) {
      const text = i === 0 ? `  ${line}` : `             ${line}`;
      lines.push(row(text, bold(text)));
    }
  }

  lines.push(bottom);
  return lines.join('\n');
}

/** One line per SKU, for --all. */
export function renderRow(sku, decision) {
  const id = sku.sku_id.padEnd(9);
  const name = sku.product_name.slice(0, 30).padEnd(31);
  const level = decision.risk_level.padEnd(6);
  const flag = decision.guardrail ? dim(' ⚠') : '';
  return `  ${id}${name}${risk(decision.risk_level)}${' '.repeat(6 - level.length + 1)}${decision.intervention}${flag}`;
}
