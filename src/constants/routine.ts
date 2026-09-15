/**
 * Routine Constants
 *
 * Day types, time block definitions, and display configs
 * for the RoutineOS routine engine.
 */

// ============================================================
// DAY TYPE CONFIG
// ============================================================

export interface DayTypeConfig {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  /** Whether this day type allows full scoring */
  fullScoring: boolean;
  /** Whether this day type reduces required habits */
  isReduced: boolean;
  sortOrder: number;
}

export const DAY_TYPE_CONFIG: Record<string, DayTypeConfig> = {
  WORKDAY: {
    id: "WORKDAY",
    label: "Workday",
    description: "Standard weekday routine",
    icon: "💼",
    color: "#3b82f6",
    bgColor: "#eff6ff",
    fullScoring: true,
    isReduced: false,
    sortOrder: 1,
  },
  WEEKEND: {
    id: "WEEKEND",
    label: "Weekend",
    description: "Saturday and Sunday routine",
    icon: "🌅",
    color: "#22c55e",
    bgColor: "#f0fdf4",
    fullScoring: true,
    isReduced: false,
    sortOrder: 2,
  },
  HOLIDAY: {
    id: "HOLIDAY",
    label: "Holiday",
    description: "Public holidays and celebrations",
    icon: "🎉",
    color: "#f59e0b",
    bgColor: "#fffbeb",
    fullScoring: false,
    isReduced: true,
    sortOrder: 3,
  },
  EXAM_DAY: {
    id: "EXAM_DAY",
    label: "Exam Day",
    description: "Exam or high-stress day with adjusted routine",
    icon: "📝",
    color: "#8b5cf6",
    bgColor: "#f5f3ff",
    fullScoring: true,
    isReduced: true,
    sortOrder: 4,
  },
  LOW_ENERGY: {
    id: "LOW_ENERGY",
    label: "Low Energy",
    description: "Sick or low-energy day with minimum requirements",
    icon: "🌧️",
    color: "#6b7280",
    bgColor: "#f9fafb",
    fullScoring: false,
    isReduced: true,
    sortOrder: 5,
  },
  CUSTOM: {
    id: "CUSTOM",
    label: "Custom",
    description: "User-defined day type",
    icon: "⚙️",
    color: "#64748b",
    bgColor: "#f8fafc",
    fullScoring: true,
    isReduced: false,
    sortOrder: 6,
  },
};

export const DAY_TYPE_LIST = Object.values(DAY_TYPE_CONFIG).sort(
  (a, b) => a.sortOrder - b.sortOrder
);

export function getDayTypeConfig(dayType: string): DayTypeConfig {
  return (
    DAY_TYPE_CONFIG[dayType] ?? {
      id: dayType,
      label: dayType,
      description: "",
      icon: "📅",
      color: "#64748b",
      bgColor: "#f8fafc",
      fullScoring: true,
      isReduced: false,
      sortOrder: 99,
    }
  );
}

// ============================================================
// TIME CONSTANTS
// ============================================================

/** Minutes in an hour */
export const MINUTES_PER_HOUR = 60;

/** Minutes in a day */
export const MINUTES_PER_DAY = 1440;

/** Default block colors palette */
export const ROUTINE_BLOCK_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
];

// ============================================================
// PREDEFINED TIME BLOCKS
// ============================================================

export interface PresetTimeBlock {
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  icon: string;
  color: string;
}

export const PRESET_TIME_BLOCKS: PresetTimeBlock[] = [
  { name: "Morning Routine",    startTime: "06:00", endTime: "07:00", icon: "🌅", color: "#f59e0b" },
  { name: "Workout",            startTime: "07:00", endTime: "08:00", icon: "💪", color: "#ef4444" },
  { name: "Breakfast",          startTime: "08:00", endTime: "08:30", icon: "🍳", color: "#f97316" },
  { name: "Deep Work",          startTime: "09:00", endTime: "12:00", icon: "🧠", color: "#3b82f6" },
  { name: "Lunch",              startTime: "12:00", endTime: "13:00", icon: "🥗", color: "#22c55e" },
  { name: "Afternoon Work",     startTime: "13:00", endTime: "17:00", icon: "💼", color: "#6366f1" },
  { name: "Evening Walk",       startTime: "17:30", endTime: "18:00", icon: "🚶", color: "#10b981" },
  { name: "Dinner",             startTime: "19:00", endTime: "19:30", icon: "🍽️", color: "#ec4899" },
  { name: "Reading",            startTime: "20:00", endTime: "21:00", icon: "📚", color: "#8b5cf6" },
  { name: "Evening Routine",    startTime: "21:00", endTime: "22:00", icon: "🌙", color: "#6366f1" },
  { name: "Sleep",              startTime: "22:30", endTime: "06:00", icon: "😴", color: "#0ea5e9" },
];

// ============================================================
// WEEKDAY CONSTANTS
// ============================================================

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const WEEKDAY_MINI = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** Standard workdays (Mon-Fri): indices */
export const WORKDAY_INDICES = [1, 2, 3, 4, 5];

/** Standard weekend days (Sat-Sun): indices */
export const WEEKEND_INDICES = [0, 6];

/** Whether a given day index (0=Sun) is a typical workday */
export function isWorkday(dayIndex: number): boolean {
  return WORKDAY_INDICES.includes(dayIndex);
}

/** Whether a given day index (0=Sun) is a typical weekend */
export function isWeekend(dayIndex: number): boolean {
  return WEEKEND_INDICES.includes(dayIndex);
}
