/**
 * Habit & Goal Categories
 *
 * Predefined categories for organizing habits and goals.
 * Users can also create their own custom categories.
 */

export interface CategoryDefinition {
  id: string; // stable slug used as default category key
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Whether this is a system (built-in) category */
  isSystem: boolean;
  /** Suggested tier for habits in this category */
  defaultTier?: "NON_NEGOTIABLE" | "GROWTH" | "BONUS";
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  // ---- Health & Fitness ----
  {
    id: "health",
    name: "Health & Fitness",
    description: "Physical health, exercise, and body care",
    icon: "💪",
    color: "#ef4444",
    isSystem: true,
    defaultTier: "NON_NEGOTIABLE",
  },
  {
    id: "nutrition",
    name: "Nutrition",
    description: "Diet, meals, hydration, and supplements",
    icon: "🥗",
    color: "#22c55e",
    isSystem: true,
    defaultTier: "NON_NEGOTIABLE",
  },
  {
    id: "sleep",
    name: "Sleep",
    description: "Sleep schedule, quality, and recovery",
    icon: "😴",
    color: "#6366f1",
    isSystem: true,
    defaultTier: "NON_NEGOTIABLE",
  },
  {
    id: "mental-health",
    name: "Mental Health",
    description: "Meditation, mindfulness, and emotional wellbeing",
    icon: "🧘",
    color: "#8b5cf6",
    isSystem: true,
    defaultTier: "GROWTH",
  },

  // ---- Learning & Growth ----
  {
    id: "learning",
    name: "Learning",
    description: "Study, reading, and skill development",
    icon: "📚",
    color: "#3b82f6",
    isSystem: true,
    defaultTier: "GROWTH",
  },
  {
    id: "career",
    name: "Career",
    description: "Work, professional development, and projects",
    icon: "💼",
    color: "#0ea5e9",
    isSystem: true,
    defaultTier: "GROWTH",
  },
  {
    id: "creativity",
    name: "Creativity",
    description: "Art, writing, music, and creative expression",
    icon: "🎨",
    color: "#f97316",
    isSystem: true,
    defaultTier: "GROWTH",
  },

  // ---- Relationships & Social ----
  {
    id: "relationships",
    name: "Relationships",
    description: "Family, friends, and social connections",
    icon: "❤️",
    color: "#ec4899",
    isSystem: true,
    defaultTier: "GROWTH",
  },

  // ---- Finance ----
  {
    id: "finance",
    name: "Finance",
    description: "Budget tracking, savings, and investments",
    icon: "💰",
    color: "#eab308",
    isSystem: true,
    defaultTier: "GROWTH",
  },

  // ---- Lifestyle & Home ----
  {
    id: "lifestyle",
    name: "Lifestyle",
    description: "Daily routines, personal care, and home",
    icon: "🏠",
    color: "#14b8a6",
    isSystem: true,
    defaultTier: "BONUS",
  },
  {
    id: "hobbies",
    name: "Hobbies",
    description: "Leisure activities and personal interests",
    icon: "🎯",
    color: "#f59e0b",
    isSystem: true,
    defaultTier: "BONUS",
  },

  // ---- Spirituality & Purpose ----
  {
    id: "spirituality",
    name: "Spirituality",
    description: "Spiritual practices, values, and purpose",
    icon: "✨",
    color: "#a78bfa",
    isSystem: true,
    defaultTier: "GROWTH",
  },

  // ---- Productivity ----
  {
    id: "productivity",
    name: "Productivity",
    description: "Focus, planning, and efficiency",
    icon: "⚡",
    color: "#64748b",
    isSystem: true,
    defaultTier: "GROWTH",
  },
];

/** Map for O(1) lookup by category ID */
export const CATEGORY_MAP: Record<string, CategoryDefinition> =
  Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

/** Get category by id, falling back to a safe default */
export function getCategoryById(id: string): CategoryDefinition {
  return (
    CATEGORY_MAP[id] ?? {
      id: "other",
      name: "Other",
      description: "Uncategorized",
      icon: "📌",
      color: "#94a3b8",
      isSystem: false,
    }
  );
}
