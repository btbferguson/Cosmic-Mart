import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { Point } from '@/lib/demoSeries';

/**
 * A stacked-gradient area chart, generalised from the pattern the team chose.
 *
 * Series are passed in rather than hardcoded so the same component serves every
 * panel, and the gradient defs are generated per series instead of copy-pasted.
 */
export function AreaPlot({
  data,
  config,
  height = 300,
  compact = false,
  currency = false,
}: {
  data: Point[];
  config: ChartConfig;
  height?: number;
  /** Abbreviate the y axis (12k rather than 12,000). */
  compact?: boolean;
  currency?: boolean;
}) {
  const keys = Object.keys(config);

  const format = (value: number) => {
    const n = new Intl.NumberFormat('en-US', {
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: 1,
    }).format(value);
    return currency ? `$${n}` : n;
  };

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart accessibilityLayer data={data}>
        <defs>
          {keys.map((key) => (
            <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.85} />
              <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 5" />
        <XAxis dataKey="category" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={currency ? 56 : 40}
          tickFormatter={format}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="natural"
            fill={`url(#fill-${key})`}
            fillOpacity={1}
            stroke={`var(--color-${key})`}
            strokeWidth={2.5}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
