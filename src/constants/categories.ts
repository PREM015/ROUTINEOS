/**
 * Category Constants
 * The canonical default category set, plus the name-normalisation rule the
 * database unique key (`[userId, nameNormalized]`) depends on.
 *
 * This list is pure (no Prisma import) so it can be shared by:
 *  - `CategoryRepository.seedDefaultsIfEmpty` — every user gets these the first
 *    time their categories are listed;
 *  - `lib/db/seeders.ts` — the demo/system seed.
 * Keep it as the single source: a copy elsewhere is how the two lists drift.
 */

export interface CategoryDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
}

/**
 * Category names are compared case- and whitespace-insensitively via
 * `nameNormalized`, which is what `findByName` and the per-user unique
 * constraint rely on.
 */
export function normalizeCategoryName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { id: 'health', name: 'Health', description: 'Workout, sleep, meals, hygiene, recovery', color: '#10b981', icon: '🟢', sortOrder: 1 },
  { id: 'learning', name: 'Learning', description: "General learning that isn't DSA/Web Dev", color: '#eab308', icon: '🟡', sortOrder: 2 },
  { id: 'dsa', name: 'DSA', description: 'DSA concepts, LeetCode, problem solving', color: '#0ea5e9', icon: '🔷', sortOrder: 3 },
  { id: 'web-dev-/-ai', name: 'Web Dev / AI', description: 'Coding, projects, AI learning, development', color: '#8b5cf6', icon: '🟣', sortOrder: 4 },
  { id: 'career', name: 'Career', description: 'Resume, portfolio, interview prep, networking', color: '#3b82f6', icon: '🔵', sortOrder: 5 },
  { id: 'college', name: 'College', description: 'Classes, assignments, labs, college work', color: '#a855f7', icon: '🟪', sortOrder: 6 },
  { id: 'personal', name: 'Personal', description: 'Breaks, family, errands, personal activities', color: '#94a3b8', icon: '⚪', sortOrder: 7 },
  { id: 'job-apply', name: 'Job Apply', description: 'Applications, job searching, recruiter outreach', color: '#f97316', icon: '🟠', sortOrder: 8 },
  { id: 'plan-&-review', name: 'Plan & Review', description: 'Daily planning, weekly reviews, journaling, reflection', color: '#06b6d4', icon: '📅', sortOrder: 9 },
  { id: 'chores-/-home', name: 'Chores / Home', description: 'Cooking, cleaning, laundry, room upkeep', color: '#ef4444', icon: '🧹', sortOrder: 10 },
  { id: 'finance', name: 'Finance', description: 'Budgeting, expenses, payments, investments', color: '#22c55e', icon: '💰', sortOrder: 11 },
  { id: 'recreation', name: 'Recreation', description: 'Hobbies, gaming, shows, leisure time', color: '#14b8a6', icon: '🎮', sortOrder: 12 },
  { id: 'commute-/-transit', name: 'Commute / Transit', description: 'Travel to college, travel between places', color: '#38bdf8', icon: '✈️', sortOrder: 13 },
  { id: 'social', name: 'Social', description: 'Friends, calls, catching up (non-career)', color: '#2dd4bf', icon: '💬', sortOrder: 14 },
  { id: 'mental-wellbeing', name: 'Mental Wellbeing', description: 'Meditation, mindfulness, stress management, breathing exercises', color: '#7c3aed', icon: '🧘', sortOrder: 15 },
  { id: 'reading', name: 'Reading', description: 'Books, novels, articles, non-study reading', color: '#f59e0b', icon: '📚', sortOrder: 16 },
  { id: 'assignments-/-projects', name: 'Assignments / Projects', description: "Large academic/project deliverables that don't fit College or Web Dev / AI", color: '#f43f5e', icon: '📝', sortOrder: 17 },
  { id: 'maintenance', name: 'Maintenance', description: 'Device maintenance, software updates, backups, organizing files', color: '#475569', icon: '🛠️', sortOrder: 18 },
  { id: 'appointments', name: 'Appointments', description: 'Doctor, dentist, bank, government office visits', color: '#fb7185', icon: '🩺', sortOrder: 19 },
  { id: 'errands', name: 'Errands', description: 'Shopping, groceries, collecting parcels', color: '#fbbf24', icon: '🛒', sortOrder: 20 },
  { id: 'family', name: 'Family', description: 'Family responsibilities, events, helping at home', color: '#d946ef', icon: '🙏', sortOrder: 21 },
  { id: 'experiments', name: 'Experiments', description: 'Trying new routines, tools, productivity experiments', color: '#84cc16', icon: '🧪', sortOrder: 22 },
  { id: 'growth', name: 'Growth', description: 'Personal development, communication, discipline, confidence', color: '#4ade80', icon: '🌱', sortOrder: 23 },
  { id: 'open-source', name: 'Open Source', description: 'GitHub issues/PRs, community projects', color: '#6366f1', icon: '🧑‍💻', sortOrder: 24 },
  { id: 'internship-/-part-time', name: 'Internship / Part-time', description: 'Actual paid work or internship hours', color: '#0284c7', icon: '💼', sortOrder: 25 },
  { id: 'communication', name: 'Communication', description: 'Email, messages, calls, DMs', color: '#7dd3fc', icon: '📧', sortOrder: 26 },
  { id: 'travel-/-trip', name: 'Travel / Trip', description: 'Vacations, trips, outings', color: '#fdba74', icon: '🏖️', sortOrder: 27 },
  { id: 'events-/-meetups', name: 'Events / Meetups', description: 'Workshops, hackathons, seminars', color: '#facc15', icon: '🎯', sortOrder: 28 },
  { id: 'certification-/-course', name: 'Certification / Course', description: 'Structured courses, exams, certificates (Coursera, NPTEL)', color: '#a78bfa', icon: '🎓', sortOrder: 29 },
  { id: 'design-/-creative', name: 'Design / Creative', description: 'Figma, UI design, art, video editing, music, photography', color: '#ec4899', icon: '🎨', sortOrder: 30 },
  { id: 'content-creation', name: 'Content Creation', description: 'Blog, YouTube, LinkedIn posts, personal brand', color: '#e11d48', icon: '📢', sortOrder: 31 },
  { id: 'freelance-/-side-hustle', name: 'Freelance / Side Hustle', description: 'Paid freelance work, side income', color: '#16a34a', icon: '💸', sortOrder: 32 },
  { id: 'volunteering', name: 'Volunteering', description: 'Community service, NGO, event volunteering', color: '#5eead4', icon: '🤝', sortOrder: 33 },
  { id: 'college-admin', name: 'College Admin', description: 'Forms, fees, documents, paperwork (vs actual classes)', color: '#c084fc', icon: '📋', sortOrder: 34 },
  { id: 'ideas-/-brainstorming', name: 'Ideas / Brainstorming', description: 'Capturing ideas, planning future side projects', color: '#fde047', icon: '💡', sortOrder: 35 },
  { id: 'typing-/-skills-drills', name: 'Typing / Skills Drills', description: 'Typing practice, speed drills, rote skill drills', color: '#a3e635', icon: '⌨️', sortOrder: 36 },
  { id: 'sleep-&-recovery', name: 'Sleep & Recovery', description: 'Bed/wake time, naps, sleep quality', color: '#60a5fa', icon: '😴', sortOrder: 37 },
  { id: 'focus-/-deep-work', name: 'Focus / Deep Work', description: 'Pomodoro & Focus Mode sessions, distraction-free blocks', color: '#2563eb', icon: '🧠', sortOrder: 38 },
  { id: 'language-learning', name: 'Language Learning', description: 'Practicing a new language (distinct from general Learning)', color: '#34d399', icon: '🗣️', sortOrder: 39 },
  { id: 'misc-/-unsorted', name: 'Misc / Unsorted', description: 'Anything that fits nowhere — prevents getting stuck when nothing matches', color: '#64748b', icon: '🎲', sortOrder: 40 },
];

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
