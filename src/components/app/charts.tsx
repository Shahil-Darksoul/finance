"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/utils/money";

/**
 * Dashboard charts.
 *
 * These are client components because Recharts needs browser measurement. All
 * data arrives pre-computed from the server; nothing here recalculates finance.
 *
 * Colours reference the theme's CSS custom properties. Recharts passes `fill`
 * straight to SVG, which does resolve `var(--x)` in a modern browser, so charts
 * follow the light/dark theme without a JS-side palette.
 */

const AXIS_STYLE = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

/** Axis ticks are cramped, so use the compact formatter with no symbol. */
function axisTick(cents: number, currency: string): string {
  return formatMoney(cents, { currency, compact: true, hideSymbol: true });
}

/* --------------------------------------------------------- net worth */

export type NetWorthPoint = {
  label: string;
  netWorthCents: number;
};

export function NetWorthChart({
  data,
  currency,
}: {
  data: NetWorthPoint[];
  currency: string;
}) {
  // Gradient id must be unique per mounted chart; two charts would otherwise
  // share the first one's <defs> when rendered in the same document.
  const gradientId = React.useId();

  if (data.length === 0) {
    return <ChartEmpty message="No balance history yet" />;
  }

  return (
    <div className="h-56 w-full" role="img" aria-label="Net worth over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(value: number) => axisTick(value, currency)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as NetWorthPoint;
              return (
                <ChartTip>
                  <p>{row.label}</p>
                  <p className="font-semibold text-foreground">
                    {formatMoney(row.netWorthCents, { currency })}
                  </p>
                </ChartTip>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="netWorthCents"
            stroke="var(--primary)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------- income/expense */

export type FlowPoint = {
  label: string;
  incomeCents: number;
  expenseCents: number;
};

export function IncomeExpenseChart({
  data,
  currency,
}: {
  data: FlowPoint[];
  currency: string;
}) {
  if (data.length === 0) {
    return <ChartEmpty message="No transactions in this range" />;
  }

  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Monthly income versus spending"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={12}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(value: number) => axisTick(value, currency)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-3)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as FlowPoint;
              return (
                <ChartTip>
                  <p className="mb-1 font-medium text-foreground">{label}</p>
                  <p className="text-positive">
                    In {formatMoney(row.incomeCents, { currency })}
                  </p>
                  <p className="text-negative">
                    Out {formatMoney(row.expenseCents, { currency })}
                  </p>
                </ChartTip>
              );
            }}
          />
          <Bar dataKey="incomeCents" fill="var(--positive)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expenseCents" fill="var(--negative)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------- projections */

export type ProjectionPoint = {
  label: string;
  netWorthCents: number;
};

/**
 * Forecast curve. Same shape as the net-worth chart but rendered with a dashed
 * stroke so a projection is never mistaken for recorded history.
 */
export function ForecastChart({
  data,
  currency,
}: {
  data: ProjectionPoint[];
  currency: string;
}) {
  const gradientId = React.useId();

  if (data.length === 0) {
    return <ChartEmpty message="No projection for this horizon" />;
  }

  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Projected net worth over time"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--info)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(value: number) => axisTick(value, currency)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as ProjectionPoint;
              return (
                <ChartTip>
                  <p>{row.label}</p>
                  <p className="font-semibold text-foreground">
                    {formatMoney(row.netWorthCents, { currency })}
                  </p>
                  <p>Projected, not guaranteed</p>
                </ChartTip>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="netWorthCents"
            stroke="var(--info)"
            strokeWidth={2}
            strokeDasharray="5 4"
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------ monthly savings */

export type SavingsPoint = {
  label: string;
  savingsCents: number;
};

/**
 * Money kept each month (income minus spending). Bars are coloured by sign so
 * a deficit month is unmistakable without relying on the axis.
 */
export function MonthlySavingsChart({
  data,
  currency,
}: {
  data: SavingsPoint[];
  currency: string;
}) {
  if (data.length === 0) {
    return <ChartEmpty message="No transactions in this range" />;
  }

  const rows = data.map((row) => ({
    ...row,
    fill: row.savingsCents >= 0 ? "var(--positive)" : "var(--negative)",
  }));

  return (
    <div className="h-56 w-full" role="img" aria-label="Money saved per month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={12}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(value: number) => axisTick(value, currency)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-3)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <ChartTip>
                  <p className="mb-1 font-medium text-foreground">{label}</p>
                  <p className={row.savingsCents >= 0 ? "text-positive" : "text-negative"}>
                    {formatMoney(row.savingsCents, { currency, signed: true })}
                  </p>
                </ChartTip>
              );
            }}
          />
          <Bar dataKey="savingsCents" radius={[4, 4, 0, 0]} maxBarSize={26}>
            {rows.map((row) => (
              <Cell key={row.label} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------ donut */

export type CategorySlice = {
  name: string;
  amountCents: number;
  ratio: number;
  color: string | null;
};

/**
 * Spending split by category.
 *
 * Categories without a stored colour fall back to the theme's semantic ramp, so
 * the chart stays readable instead of rendering as one indistinct mass.
 */
export function CategoryDonut({
  data,
  currency,
}: {
  data: CategorySlice[];
  currency: string;
}) {
  const fallback = [
    "var(--primary)",
    "var(--info)",
    "var(--accent)",
    "var(--warning)",
    "var(--positive)",
    "var(--negative)",
  ];

  const rows = data.map((row, index) => ({
    ...row,
    fill: row.color ?? fallback[index % fallback.length],
  }));

  if (rows.length === 0) {
    return <ChartEmpty message="Nothing spent in this range" />;
  }

  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div
        className="h-44 w-44 shrink-0"
        role="img"
        aria-label="Spending by category"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="amountCents"
              nameKey="name"
              innerRadius="60%"
              outerRadius="94%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {rows.map((row) => (
                <Cell key={row.name} fill={row.fill} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <ChartTip>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p>{formatMoney(row.amountCents, { currency })}</p>
                    {total > 0 ? (
                      <p>{Math.round((row.amountCents / total) * 100)}% of spending</p>
                    ) : null}
                  </ChartTip>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: row.fill }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{row.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatMoney(row.amountCents, { currency })}
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground/60">
              {Math.round(row.ratio * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------- helpers */

function ChartTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground shadow-lg">
      {children}
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-56 w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
      {message}
    </div>
  );
}