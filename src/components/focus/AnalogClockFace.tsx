import { cn } from '@/lib/utils';
import type { ClockHandAngles } from '@/lib/focus/world-clock';

const CLOCK_CENTER = 100;
const CLOCK_MARKS = Array.from({ length: 60 }, (_, index) => {
  const angle = (index * 6 * Math.PI) / 180 - Math.PI / 2;
  const major = index % 5 === 0;
  const innerRadius = major ? 78 : 85;
  const outerRadius = 89;

  return {
    index,
    major,
    x1: CLOCK_CENTER + Math.cos(angle) * innerRadius,
    y1: CLOCK_CENTER + Math.sin(angle) * innerRadius,
    x2: CLOCK_CENTER + Math.cos(angle) * outerRadius,
    y2: CLOCK_CENTER + Math.sin(angle) * outerRadius,
  };
});
const CLOCK_NUMBERS = [
  { value: 12, x: 100, y: 39 },
  { value: 3, x: 161, y: 104 },
  { value: 6, x: 100, y: 168 },
  { value: 9, x: 39, y: 104 },
];

interface AnalogClockFaceProps {
  angles: ClockHandAngles;
  label: string;
  gradientId: string;
  className?: string;
}

export function AnalogClockFace({ angles, label, gradientId, className }: AnalogClockFaceProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--card)" />
          <stop offset="100%" stopColor="var(--accent-focus)" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle
        cx={CLOCK_CENTER}
        cy={CLOCK_CENTER}
        r="94"
        fill={`url(#${gradientId})`}
        stroke="var(--border)"
        strokeWidth="2"
        data-focus-clock-face=""
      />
      {CLOCK_MARKS.map((mark) => (
        <line
          key={mark.index}
          x1={mark.x1}
          y1={mark.y1}
          x2={mark.x2}
          y2={mark.y2}
          stroke={mark.major ? 'var(--foreground)' : 'var(--muted-foreground)'}
          strokeWidth={mark.major ? 2.5 : 1}
          strokeLinecap="round"
          opacity={mark.major ? 0.8 : 0.45}
        />
      ))}
      {CLOCK_NUMBERS.map(({ value, x, y }) => (
        <text
          key={value}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--foreground)"
          fontSize="11"
          fontWeight="600"
          opacity="0.8"
        >
          {value}
        </text>
      ))}
      <g transform={`rotate(${angles.hour} ${CLOCK_CENTER} ${CLOCK_CENTER})`}>
        <line
          x1={CLOCK_CENTER}
          y1={CLOCK_CENTER + 5}
          x2={CLOCK_CENTER}
          y2="64"
          stroke="var(--foreground)"
          strokeWidth="5"
          strokeLinecap="round"
          data-focus-clock-hand="hour"
        />
      </g>
      <g transform={`rotate(${angles.minute} ${CLOCK_CENTER} ${CLOCK_CENTER})`}>
        <line
          x1={CLOCK_CENTER}
          y1={CLOCK_CENTER + 8}
          x2={CLOCK_CENTER}
          y2="47"
          stroke="var(--foreground)"
          strokeWidth="3"
          strokeLinecap="round"
          data-focus-clock-hand="minute"
        />
      </g>
      <g transform={`rotate(${angles.second} ${CLOCK_CENTER} ${CLOCK_CENTER})`}>
        <line
          x1={CLOCK_CENTER}
          y1={CLOCK_CENTER + 15}
          x2={CLOCK_CENTER}
          y2="37"
          stroke="var(--accent-focus)"
          strokeWidth="1.5"
          strokeLinecap="round"
          data-focus-clock-hand="second"
        />
      </g>
      <circle cx={CLOCK_CENTER} cy={CLOCK_CENTER} r="4" fill="var(--accent-focus)" />
    </svg>
  );
}
