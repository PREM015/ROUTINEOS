/**
 * Goal Status Configuration
 *
 * Display metadata for each goal status value,
 * used for badges, filters, and UI labeling.
 */

export interface GoalStatusConfig {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  /** Whether goals with this status appear in the active view */
  isActive: boolean;
  /** Whether goals with this status are in a terminal state */
  isTerminal: boolean;
  /** Sort order in filter dropdowns */
  sortOrder: number;
}

export const GOAL_STATUS_CONFIG: Record<string, GoalStatusConfig> = {
  ACTIVE: {
    id: "ACTIVE",
    label: "Active",
    description: "Currently working towards this goal",
    icon: "🎯",
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#93c5fd",
    isActive: true,
    isTerminal: false,
    sortOrder: 1,
  },
  COMPLETED: {
    id: "COMPLETED",
    label: "Completed",
    description: "Goal has been successfully achieved",
    icon: "✅",
    color: "#22c55e",
    bgColor: "#f0fdf4",
    borderColor: "#86efac",
    isActive: false,
    isTerminal: true,
    sortOrder: 2,
  },
  MISSED: {
    id: "MISSED",
    label: "Missed",
    description: "Goal was not achieved by its deadline",
    icon: "❌",
    color: "#ef4444",
    bgColor: "#fef2f2",
    borderColor: "#fca5a5",
    isActive: false,
    isTerminal: true,
    sortOrder: 3,
  },
  CARRIED_OVER: {
    id: "CARRIED_OVER",
    label: "Carried Over",
    description: "Goal has been moved to the next period",
    icon: "⏭️",
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fcd34d",
    isActive: true,
    isTerminal: false,
    sortOrder: 4,
  },
  ON_HOLD: {
    id: "ON_HOLD",
    label: "On Hold",
    description: "Goal temporarily paused",
    icon: "⏸️",
    color: "#6b7280",
    bgColor: "#f9fafb",
    borderColor: "#d1d5db",
    isActive: false,
    isTerminal: false,
    sortOrder: 5,
  },
  CANCELLED: {
    id: "CANCELLED",
    label: "Cancelled",
    description: "Goal has been cancelled",
    icon: "🚫",
    color: "#64748b",
    bgColor: "#f8fafc",
    borderColor: "#cbd5e1",
    isActive: false,
    isTerminal: true,
    sortOrder: 6,
  },
};

export const GOAL_STATUS_LIST = Object.values(GOAL_STATUS_CONFIG).sort(
  (a, b) => a.sortOrder - b.sortOrder
);

export const ACTIVE_GOAL_STATUSES = GOAL_STATUS_LIST.filter(
  (s) => s.isActive
).map((s) => s.id);

export const TERMINAL_GOAL_STATUSES = GOAL_STATUS_LIST.filter(
  (s) => s.isTerminal
).map((s) => s.id);

export function getGoalStatusConfig(status: string): GoalStatusConfig {
  return (
    GOAL_STATUS_CONFIG[status] ?? {
      id: status,
      label: status,
      description: "",
      icon: "❓",
      color: "#64748b",
      bgColor: "#f8fafc",
      borderColor: "#cbd5e1",
      isActive: false,
      isTerminal: false,
      sortOrder: 99,
    }
  );
}

// ============================================================
// GOAL PRIORITY CONFIG
// ============================================================

export interface GoalPriorityConfig {
  id: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  sortOrder: number;
}

export const GOAL_PRIORITY_CONFIG: Record<string, GoalPriorityConfig> = {
  CRITICAL: {
    id: "CRITICAL",
    label: "Critical",
    icon: "🔴",
    color: "#ef4444",
    bgColor: "#fef2f2",
    sortOrder: 1,
  },
  HIGH: {
    id: "HIGH",
    label: "High",
    icon: "🟠",
    color: "#f97316",
    bgColor: "#fff7ed",
    sortOrder: 2,
  },
  MEDIUM: {
    id: "MEDIUM",
    label: "Medium",
    icon: "🟡",
    color: "#eab308",
    bgColor: "#fefce8",
    sortOrder: 3,
  },
  LOW: {
    id: "LOW",
    label: "Low",
    icon: "🟢",
    color: "#22c55e",
    bgColor: "#f0fdf4",
    sortOrder: 4,
  },
};

export const GOAL_PRIORITY_LIST = Object.values(GOAL_PRIORITY_CONFIG).sort(
  (a, b) => a.sortOrder - b.sortOrder
);
