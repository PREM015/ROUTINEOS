'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTodayString } from '@/lib/dates';
import { useCountUp } from '@/components/motion/useCountUp';

export interface ScoreAxis {
  label: string;
  value: number;
}

interface CoreScoreWidgetProps {
  /** Override axes (e.g. for stories/tests). Defaults to today's live breakdown. */
  axes?: ScoreAxis[];
  /** Overall score shown in the centre. Defaults to the live total. */
  score?: number;
  dayMode?: string;
}

interface ScoreResponse {
  totalScore?: number | null;
  coreScore?: number | null;
  growthScore?: number | null;
  bonusScore?: number | null;
  habitCompletionRate?: number | null;
  routineCompletionRate?: number | null;
  sleepScore?: number | null;
  overallGrade?: string | null;
}

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 88;
const GRID_STEPS = [20, 40, 60, 80, 100];

function clamp100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

function pointFor(axisIndex: number, axisCount: number, fraction: number): { x: number; y: number } {
  const angle = (2 * Math.PI * axisIndex) / axisCount - Math.PI / 2;
  const r = RADIUS * fraction;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

function polygonPoints(axisCount: number, fraction: number): string {
  return Array.from({ length: axisCount }, (_, i) => {
    const p = pointFor(i, axisCount, fraction);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}

function BarsFallback({ axes }: { axes: ScoreAxis[] }) {
  return (
    <div className="w-full space-y-2" role="img" aria-label="Today progress bars">
      {axes.map((a) => (
        <div key={a.label}>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{a.label}</span>
            <span className="tabular-nums">{Math.round(a.value)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${clamp100(a.value)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Today Progress radar: one axis per score parameter. 5 axes render a
 * pentagon, 6 a hexagon, any other N a regular N-gon (N < 3 falls back to
 * bars). Geometry derives purely from data (no Date/Math.random at render),
 * so server and client HTML match; the draw-in animation runs via CSS only
 * after mount and is disabled for reduced motion.
 */
export function CoreScoreWidget({ axes: axesProp, score: scoreProp, dayMode }: CoreScoreWidgetProps) {
  const [live, setLive] = useState<ScoreResponse | null>(null);
  const [loading, setLoading] = useState(!axesProp);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (axesProp) return;
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const today = getTodayString();
        const res = await fetch(`/api/score/${today}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to load score');
        if (!cancelled) setLive(data as ScoreResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load score');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [axesProp]);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetch(`/api/score/${getTodayString()}`)
      .then((r) => r.json())
      .then((d) => setLive(d as ScoreResponse))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load score'))
      .finally(() => setLoading(false));
  };

  const axes: ScoreAxis[] = useMemo(() => {
    if (axesProp) return axesProp;
    if (!live) return [];
    return [
      { label: 'Core', value: clamp100(live.coreScore ?? 0) },
      { label: 'Growth', value: clamp100(live.growthScore ?? 0) },
      { label: 'Bonus', value: clamp100(live.bonusScore ?? 0) },
      { label: 'Habits', value: clamp100(live.habitCompletionRate ?? 0) },
      { label: 'Routine', value: clamp100(live.routineCompletionRate ?? 0) },
      { label: 'Sleep', value: clamp100(live.sleepScore ?? 0) },
    ];
  }, [axesProp, live]);

  const overall = scoreProp ?? live?.totalScore ?? 0;
  const n = axes.length;
  const display = useCountUp(overall, 1);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5" aria-busy="true" aria-label="Loading today progress">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/2 mb-4" />
          <div className="mx-auto h-48 w-48 rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground">Today Progress</h3>
        <p role="alert" className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>
        <button
          onClick={retry}
          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (n === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground">Today Progress</h3>
        <p className="mt-2 text-sm text-muted-foreground">No score yet today — complete a habit or routine block to get started.</p>
      </div>
    );
  }

  const valuePoints = axes
    .map((a, i) => {
      const p = pointFor(i, n, clamp100(a.value) / 100);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="bg-card border border-border rounded-xl p-5 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Today Progress</h3>
        {dayMode && (
          <span className="px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground rounded-full">{dayMode}</span>
        )}
      </div>

      {n < 3 ? (
        <BarsFallback axes={axes} />
      ) : (
        <div className="radar-in relative mx-auto w-full max-w-[280px]">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="w-full h-auto"
            role="img"
            aria-label={`Today progress radar: ${axes.map((a) => `${a.label} ${Math.round(a.value)}`).join(', ')}`}
          >
            {/* Concentric grid polygons */}
            {GRID_STEPS.map((step) => (
              <polygon
                key={step}
                points={polygonPoints(n, step / 100)}
                fill="none"
                className="stroke-border"
                strokeWidth={step === 100 ? 1.5 : 1}
              />
            ))}

            {/* Axis lines */}
            {axes.map((_, i) => {
              const p = pointFor(i, n, 1);
              return (
                <line
                  key={i}
                  x1={CENTER}
                  y1={CENTER}
                  x2={p.x}
                  y2={p.y}
                  className="stroke-border"
                  strokeWidth={1}
                />
              );
            })}

            {/* Value polygon */}
            <polygon
              points={valuePoints}
              className="fill-primary/25 stroke-primary"
              strokeWidth={2}
              strokeLinejoin="round"
            />

            {/* Vertex dots + hover targets */}
            {axes.map((a, i) => {
              const p = pointFor(i, n, clamp100(a.value) / 100);
              const active = hovered === i;
              return (
                <g key={a.label}>
                  <title>{`${a.label}: ${Math.round(a.value)}`}</title>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={active ? 6 : 4}
                    className="fill-primary stroke-card"
                    strokeWidth={2}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={14}
                    fill="transparent"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setHovered(active ? null : i)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`${a.label}: ${Math.round(a.value)}`}</title>
                  </circle>
                </g>
              );
            })}

            {/* Axis labels */}
            {axes.map((a, i) => {
              const p = pointFor(i, n, 1.18);
              return (
                <text
                  key={a.label}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-muted-foreground"
                  fontSize={11}
                  fontWeight={600}
                >
                  {a.label}
                </text>
              );
            })}

            {/* Centre score */}
            <text
              x={CENTER}
              y={CENTER - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground"
              fontSize={26}
              fontWeight={800}
            >
              {Math.round(display)}
            </text>
            <text
              x={CENTER}
              y={CENTER + 14}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={10}
            >
              overall
            </text>
          </svg>

          {/* Tooltip for hover/tap */}
          {hovered !== null && axes[hovered] && (
<div
            role="status"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-lg fade-rise-in"
          >
              {axes[hovered].label}: {Math.round(axes[hovered].value)}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {live?.overallGrade ? `Grade ${live.overallGrade} · ` : ''}
        {n === 5 ? 'Pentagon' : n === 6 ? 'Hexagon' : `${n}-sided`} view of today&apos;s score
      </p>
    </div>
  );
}

export default CoreScoreWidget;
