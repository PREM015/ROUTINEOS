/**
 * Category Constants
 * Predefined categories with metadata
 */

export interface CategoryDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'health-fitness',
    name: 'Health & Fitness',
    description: 'Physical health, exercise, and nutrition',
    color: '#10b981',
    icon: '💪',
    sortOrder: 1,
  },
  {
    id: 'productivity',
    name: 'Productivity',
    description: 'Work, study, and task completion',
    color: '#3b82f6',
    icon: '🎯',
    sortOrder: 2,
  },
  {
    id: 'mindfulness',
    name: 'Mindfulness',
    description: 'Meditation, reflection, and mental health',
    color: '#8b5cf6',
    icon: '🧘',
    sortOrder: 3,
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Education, skill development, and reading',
    color: '#f59e0b',
    icon: '📚',
    sortOrder: 4,
  },
  {
    id: 'creativity',
    name: 'Creativity',
    description: 'Art, writing, music, and creative pursuits',
    color: '#ec4899',
    icon: '🎨',
    sortOrder: 5,
  },
  {
    id: 'social',
    name: 'Social',
    description: 'Relationships, communication, and networking',
    color: '#06b6d4',
    icon: '👥',
    sortOrder: 6,
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Money management, budgeting, and investing',
    color: '#22c55e',
    icon: '💰',
    sortOrder: 7,
  },
  {
    id: 'home',
    name: 'Home & Living',
    description: 'Chores, organization, and home improvement',
    color: '#ef4444',
    icon: '🏠',
    sortOrder: 8,
  },
  {
    id: 'personal-care',
    name: 'Personal Care',
    description: 'Self-care, grooming, and hygiene',
    color: '#a855f7',
    icon: '✨',
    sortOrder: 9,
  },
  {
    id: 'hobbies',
    name: 'Hobbies',
    description: 'Leisure activities and personal interests',
    color: '#14b8a6',
    icon: '🎮',
    sortOrder: 10,
  },
] as const;

export const CATEGORY_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
] as const;

export type CategoryColor = typeof CATEGORY_COLORS[number];

export function getCategoryById(id: string): CategoryDefinition | undefined {
  return DEFAULT_CATEGORIES.find(cat => cat.id === id);
}

export function getCategoryByName(name: string): CategoryDefinition | undefined {
  return DEFAULT_CATEGORIES.find(
    cat => cat.name.toLowerCase() === name.toLowerCase()
  );
}