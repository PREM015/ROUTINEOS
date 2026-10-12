/**
 * Seeds 14 Day Types (DayTypeDefinition + RoutineTemplate + RoutineBlock)
 * for kumarrahuljmp8@gmail.com, in the requested order.
 *
 * Run:      npx tsx prisma/seed-day-types.ts
 * Override: SEED_USER_EMAIL=other@example.com
 * Replace:  REPLACE=1  -> deletes and re-creates blocks of templates that already exist.
 *           WARNING: deleting a RoutineBlock cascades to its RoutineLog rows.
 *           Without REPLACE, existing templates are skipped, so re-running is safe.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (check your .env)");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EMAIL = process.env.SEED_USER_EMAIL ?? "kumarrahuljmp8@gmail.com";
const REPLACE = process.env.REPLACE === "1";

// ───────────── Categories ─────────────
// [label, icon, default colour]. Used when a block has no explicit colour,
// and to create any category the user does not have yet.
const CATS = {
  sleep: ["Sleep & Recovery", "😴", "#22C55E"],
  health: ["Health", "🟢", "#22C55E"],
  focus: ["Focus / Deep Work", "🧠", "#F59E0B"],
  college: ["College", "🟪", "#6366F1"],
  personal: ["Personal", "⚪", "#64748B"],
  dsa: ["DSA", "🔷", "#3B82F6"],
  web: ["Web Dev / AI", "🟣", "#8B5CF6"],
  learn: ["Learning", "📚", "#0EA5E9"],
  career: ["Career", "💼", "#F97316"],
  jobs: ["Job Apply", "💼", "#F97316"],
  plan: ["Plan & Review", "📝", "#14B8A6"],
  commute: ["Commute / Transit", "✈️", "#06B6D4"],
  assign: ["Assignments/Projects", "📚", "#8B5CF6"],
  rec: ["Recreation", "🎨", "#EC4899"],
  family: ["Family", "👨‍👩‍👦", "#F59E0B"],
  social: ["Social", "👥", "#F59E0B"],
  mental: ["Mental Wellbeing", "🌿", "#8B5CF6"],
  comm: ["Communication", "🗣️", "#0EA5E9"],
  errands: ["Errands", "🛍️", "#F59E0B"],
  trip: ["Travel/Trip", "🧳", "#0EA5E9"],
  maint: ["Maintenance", "🧹", "#64748B"],
  finance: ["Finance", "💰", "#10B981"],
  chores: ["Chores/Home", "🧺", "#78716C"],
  reading: ["Reading", "📖", "#A855F7"],
  admin: ["College Admin", "🏛️", "#0EA5E9"],
  ideas: ["Ideas/Brainstorming", "💡", "#F59E0B"],
  design: ["Design/Creative", "🎨", "#EC4899"],
} as const;
type K = keyof typeof CATS;

// Energy values are stored as plain strings on RoutineBlock.energyLevel.
// Change here if your UI expects a different spelling.
const ENERGY = { L: "LOW", M: "MEDIUM", H: "HIGH", F: "FLEXIBLE" } as const;
type E = keyof typeof ENERGY;

const SLATE = "#64748B";
const RED = "#DC2626";
const INDIGO = "#6366F1";

// [start, end, title, category, energy, icon, description, notes?, colour?]
type Row = [string, string, string, K, E, string, string, (string | null)?, string?];

interface Day {
  name: string;
  slug: string;
  dayType: "WORKDAY" | "WEEKEND" | "HOLIDAY" | "EXAM_DAY" | "LOW_ENERGY" | "CUSTOM";
  color: string;
  icon: string;
  isDefault?: boolean;
  description: string;
  priority?: string;
  rule?: string;
  rows: Row[];
}

const DAYS: Day[] = [
  // ───────────────────────── 1. COLLEGE DAY ─────────────────────────
  {
    name: "College Day", slug: "college-day", dayType: "WORKDAY", color: "#3B82F6", icon: "🏫", isDefault: true,
    description: "A regular college day focused on attending classes, maintaining a healthy daily routine, and completing planned study, fitness, development, and personal goals.",
    priority: "College → DSA → Web Development / AI / Projects → Personal Growth",
    rows: [
      ["00:00", "05:00", "Sleep", "sleep", "L", "😴", "Night sleep and recovery before the college day.", "Protect the full sleep window and avoid unnecessary late-night activity."],
      ["05:00", "05:15", "Wake Up", "health", "M", "🌅", "Start the day, get out of bed, hydrate, and prepare for the morning routine.", "Start the day without extending the wake-up block.", SLATE],
      ["05:15", "06:30", "Workout", "health", "H", "🏋️", "Complete the planned morning workout, running, or gym session.", "Keep the session focused and finish on time so the remaining morning routine is not delayed."],
      ["06:30", "07:00", "Brush Teeth + Take a Shower", "health", "M", "🚿", "Complete morning hygiene and get ready for the day.", "Finish getting ready before starting the next study block."],
      ["07:00", "08:15", "Morning Focus Session", "focus", "H", "🎯", "Use the morning focus window for DSA revision, technical learning, or another current priority.", "Choose one clear task before starting. GATE preparation has been removed."],
      ["08:15", "09:00", "Breakfast", "health", "M", "🍳", "Have breakfast and prepare to leave for college.", "Complete breakfast and college preparation within this window."],
      ["09:00", "13:00", "College", "college", "H", "🏫", "Attend college classes, lectures, practical work, and complete required academic activities.", "Focus on attendance, lectures, practicals, notes, and immediate college responsibilities."],
      ["13:00", "14:00", "Lunch + Travel / Recovery", "personal", "L", "🍱", "Have lunch and use the remaining time for travel and recovery after college.", "Treat this as a transition and recovery period before the afternoon study block. Use Commute / Transit instead if travel is the main activity."],
      ["14:00", "14:30", "Nap", "sleep", "L", "😴", "Take a short recovery nap after college and lunch.", "Keep the nap limited to the scheduled 30 minutes."],
      ["14:30", "17:30", "DSA", "dsa", "H", "🧠", "Dedicated DSA study and problem-solving session. Work on concepts, implementation, and coding problems.", "Prioritize active problem solving over passive learning."],
      ["17:30", "18:00", "Break / Recovery", "personal", "L", "☕", "Take a short break after the DSA session and recover before the evening development block.", "Keep the break controlled so the next block starts on time."],
      ["18:00", "20:00", "Web Dev — Evening", "web", "H", "💻", "Work on web development, AI, or project development during the evening focus session.", "Prioritize practical development and measurable project progress."],
      ["20:00", "21:00", "Dinner + Break", "health", "L", "🍽️", "Have dinner and take a proper evening recovery break.", "Use this as the transition before the unplanned evening hours.", SLATE],
      ["21:00", "23:00", "Unplanned Hours", "personal", "F", "🕘", "Flexible time for unfinished tasks, personal activities, family time, relaxation, or anything that needs attention that day.", "No fixed task is required. Use this time according to your needs, avoid letting it become unintentional scrolling, and begin winding down before sleep."],
    ],
  },

  // ───────────────────────── 2. PLACEMENT DAY ─────────────────────────
  {
    name: "Placement Day", slug: "placement-day", dayType: "WORKDAY", color: "#F97316", icon: "💼",
    description: "A structured placement preparation day focused on aptitude, DSA, technical interviews, development projects, resume improvement, job applications, and career growth.",
    priority: "Aptitude → DSA → Technical Interview Preparation → Web Development / AI / Projects → Job Applications",
    rows: [
      ["00:00", "05:00", "Sleep", "sleep", "L", "😴", "Night sleep and recovery before a focused placement preparation day.", "Aim for adequate sleep. If possible, adjust the schedule to allow 7–9 hours of sleep rather than routinely limiting sleep to five hours."],
      ["05:00", "05:15", "Wake Up", "health", "M", "🌅", "Get out of bed, hydrate, and prepare for the morning routine.", "Start on time without unnecessary phone use.", SLATE],
      ["05:15", "06:30", "Workout", "health", "H", "🏋️", "Complete the planned workout, running, or gym session.", "Maintain physical fitness and consistency without compromising recovery."],
      ["06:30", "07:00", "Brush Teeth + Take a Shower", "health", "M", "🚿", "Complete morning hygiene and get ready for focused study.", "Finish the morning routine before beginning placement preparation."],
      ["07:00", "08:15", "Aptitude & Reasoning", "focus", "H", "🧮", "Practise quantitative aptitude, logical reasoning, verbal ability, and placement-style timed questions.", "Focus on accuracy, speed, shortcuts, and reviewing mistakes. Track weak topics for revision."],
      ["08:15", "09:00", "Breakfast", "health", "M", "🍳", "Have breakfast and prepare the day's study environment.", "Check the day's placement goals and keep study materials ready."],
      ["09:00", "12:00", "DSA & Coding Problems", "dsa", "H", "💻", "Practise data structures and algorithms, solve coding interview problems, revise patterns, and improve problem-solving skills.", "Solve problems independently before checking solutions. Record complexity, mistakes, and important patterns. Include timed practice."],
      ["12:00", "13:00", "Lunch + Recovery", "personal", "L", "🍱", "Have lunch, take a break, and recover after the morning coding session.", "Step away from the screen and prepare for the next session."],
      ["13:00", "14:00", "Core CS & Technical Interview Preparation", "learn", "M", "🧠", "Prepare interview fundamentals such as DBMS, operating systems, computer networks, OOP, SQL, and JavaScript fundamentals.", "Study one topic at a time and practise explaining answers aloud. Rotate topics based on interview requirements."],
      ["14:00", "14:30", "Nap / Recovery", "sleep", "L", "😴", "Take a short nap or quiet rest to restore afternoon focus.", "Keep the recovery period limited to 30 minutes."],
      ["14:30", "16:30", "Web Development / AI / Projects", "web", "H", "🚀", "Build practical projects, improve existing applications, practise full-stack development, or explore AI integration.", "Prioritise working features, code quality, Git commits, and demonstrable project progress relevant to your portfolio."],
      ["16:30", "17:30", "Interview Practice", "career", "H", "🎤", "Practise technical interview questions, project explanations, HR questions, and mock interviews.", "Explain your solutions out loud. Prepare concise, honest answers about your projects, technical decisions, strengths, and learning experiences."],
      ["17:30", "18:00", "Break / Recovery", "personal", "L", "☕", "Take a short break after coding and interview preparation.", "Walk, stretch, hydrate, and return on time."],
      ["18:00", "19:00", "Job Applications & Career Growth", "jobs", "M", "📩", "Find relevant software developer internships and placement opportunities, customise applications, improve your resume, and contact recruiters when appropriate.", "Prioritise relevant openings, track application status, and avoid submitting low-quality duplicate applications."],
      ["19:00", "20:00", "Dinner + Break", "health", "L", "🍽️", "Have dinner and recover before the final review session.", "Take a proper break and avoid letting screen time extend unnecessarily.", SLATE],
      ["20:00", "21:00", "Revision + Daily Review", "plan", "M", "📈", "Review coding mistakes, revise interview notes, check application progress, and plan tomorrow's priorities.", "Record completed tasks, pending work, weak areas, and the next day's top three goals."],
      ["21:00", "23:00", "Unplanned Hours", "personal", "F", "🕘", "Flexible time for family, personal activities, unfinished tasks, relaxation, or unexpected responsibilities.", "Keep this time flexible rather than adding mandatory study. Begin winding down before bedtime."],
    ],
  },

  // ───────────────────────── 3. WEEKEND DAY ─────────────────────────
  {
    name: "Weekend Day", slug: "weekend-day", dayType: "WEEKEND", color: "#14B8A6", icon: "🌤️", isDefault: true,
    description: "A balanced weekend routine focused on maintaining healthy habits, strengthening DSA and technical skills, building real-world projects, reviewing weekly progress, and making time for family, hobbies, and recovery. Weekends are for progress and recovery together. Not every free hour needs a mandatory task.",
    priority: "Fitness → DSA → Projects / Web Dev / AI → Personal Growth → Weekly Review",
    rows: [
      ["00:00", "07:00", "Sleep", "sleep", "L", "😴", "Get sufficient overnight rest to recover from the week's college, coding, and study workload.", "Keep a consistent sleep schedule and prioritise recovery instead of staying up late unnecessarily."],
      ["07:00", "07:15", "Wake Up + Hydration", "health", "M", "🌅", "Wake up, hydrate, and prepare for a relaxed but productive weekend.", "Avoid extending the wake-up block with unnecessary phone scrolling.", SLATE],
      ["07:15", "08:15", "Workout / Running", "health", "H", "🏋️", "Complete the planned workout, running, mobility exercises, or gym session.", "Adjust intensity according to fatigue from the week. Recovery days can use light walking or stretching."],
      ["08:15", "08:45", "Morning Hygiene", "health", "M", "🚿", "Brush teeth, take a shower, and get ready for the day.", "Maintain the same basic hygiene habits as on college days."],
      ["08:45", "09:15", "Breakfast", "health", "M", "🍳", "Have breakfast and prepare the workspace for the first focused study session.", "Decide the day's top technical priority before starting."],
      ["09:15", "11:15", "DSA Deep Work", "dsa", "H", "🧠", "Solve coding problems, revise data structures and algorithms, and strengthen problem-solving patterns.", "Attempt problems independently, analyse time and space complexity, and maintain a list of mistakes for revision."],
      ["11:15", "11:45", "Break / Refresh", "personal", "L", "☕", "Take a break after the morning coding session.", "Walk around, stretch, hydrate, and return without extending the break unnecessarily."],
      ["11:45", "13:45", "Web Development / AI / Projects", "web", "H", "💻", "Build real features, improve existing applications, explore AI integration, or work on portfolio-worthy projects.", "Select one measurable deliverable. Prefer implementation, testing, and clean commits over passively watching tutorials."],
      ["13:45", "14:30", "Lunch", "health", "L", "🍱", "Have lunch and take a short break from the computer.", "Eat comfortably and avoid carrying study tasks into the entire break."],
      ["14:30", "15:00", "Nap / Recovery", "sleep", "L", "😴", "Take a short nap or rest to recharge for the afternoon.", "Skip the nap if you feel rested and use the time for quiet recovery instead."],
      ["15:00", "16:00", "Technical Learning", "learn", "M", "📖", "Learn or revise a technical topic such as JavaScript, TypeScript, backend development, databases, system design fundamentals, or AI.", "Follow your current learning roadmap. Write notes and implement a small example instead of collecting more resources."],
      ["16:00", "17:00", "Career Growth / Open Source", "career", "M", "🚀", "Improve your portfolio, review your resume, contribute to open source, explore opportunities, or strengthen your professional profile.", "Choose the activity that best supports your current career goals. Job applications are optional on weekends unless a deadline is approaching."],
      ["17:00", "18:00", "Personal Time / Outdoor Activity", "personal", "F", "🌳", "Spend time outdoors, walk, enjoy a hobby, meet friends, or relax away from the screen.", "Use this block to maintain a healthy balance between technical growth and personal life."],
      ["18:00", "19:00", "Dinner + Family Time", "health", "L", "🍽️", "Have dinner or an evening meal at a suitable time, spend time with family, and relax.", "Keep the block flexible for your household's normal meal schedule.", SLATE],
      ["19:00", "20:00", "Weekly Review & Planning", "plan", "M", "📈", "Review the week's habits, DSA progress, projects, learning, goals, and unfinished tasks.", "Identify wins, recurring problems, and priorities for the coming week. This is the main weekly review; a shorter review can be used on the other weekend day."],
      ["20:00", "21:00", "Optional Focus / Unfinished Tasks", "focus", "F", "🎯", "Use this optional block for unfinished project work, light revision, reading, or a task that genuinely needs attention.", "Do not turn every weekend evening into compulsory overtime. If the day's priorities are complete, use this time for rest."],
      ["21:00", "23:00", "Unplanned Hours / Relaxation", "personal", "F", "🕘", "Enjoy free time, family activities, entertainment, hobbies, or anything that needs attention.", "Keep the time genuinely flexible. Begin winding down before sleep and avoid unintentional scrolling that delays bedtime."],
    ],
  },

  // ───────────────────────── 4. EXAM DAY ─────────────────────────
  {
    name: "Exam Day", slug: "exam-day", dayType: "EXAM_DAY", color: RED, icon: "📝", isDefault: true,
    description: "A focused examination-day routine designed to support preparation, concentration, timely exam attendance, healthy meals, and post-exam recovery.",
    priority: "Revision → Exam Preparation → Examination → Recovery → Review",
    rows: [
      ["00:00", "05:00", "Sleep", "sleep", "L", "😴", "Get overnight rest before the examination.", "Prioritise adequate sleep and avoid last-minute late-night studying."],
      ["05:00", "05:15", "Wake Up", "health", "M", "🌅", "Wake up, hydrate, and prepare for the exam day.", "Start calmly and avoid unnecessary phone use.", SLATE],
      ["05:15", "06:00", "Light Exercise & Freshen Up", "health", "M", "🚶", "Do light stretching or walking and freshen up.", "Avoid exhausting workouts before the examination."],
      ["06:00", "07:30", "High-Priority Revision", "learn", "H", "📖", "Revise important concepts, formulas, definitions, and frequently tested topics.", "Focus on known material and weak areas. Avoid starting large new topics."],
      ["07:30", "08:00", "Breakfast", "health", "M", "🍳", "Eat breakfast and prepare for the examination.", "Keep the meal simple and allow enough time to get ready."],
      ["08:00", "08:30", "Final Revision & Exam Checklist", "focus", "H", "✅", "Review concise notes and check the exam instructions, admit card, stationery, and required documents.", "Adjust this block to the actual reporting time. Avoid rushing or learning entirely new material."],
      ["08:30", "09:00", "Travel / Exam Setup", "commute", "M", "🚌", "Travel to the examination centre or prepare the required online examination setup.", "Use the actual travel time and reporting instructions. Leave an appropriate buffer.", SLATE],
      ["09:00", "12:00", "Examination", "assign", "H", "📝", "Attend the examination and complete the paper with concentration and effective time management.", "Follow the official exam duration and rules. Read questions carefully and allocate time according to marks.", RED],
      ["12:00", "13:00", "Lunch + Recovery", "personal", "L", "🍱", "Have lunch and recover after the examination.", "Avoid excessive post-exam answer comparisons if they increase stress."],
      ["13:00", "13:30", "Rest / Nap", "sleep", "L", "😴", "Take a short nap or rest after the exam.", "Skip the nap if you feel rested."],
      ["13:30", "15:30", "Next Exam Preparation", "learn", "H", "📘", "Begin preparation for the next examination using the syllabus, notes, and important questions.", "If this is the final exam, use the block for recovery or personal activities instead."],
      ["15:30", "16:00", "Break / Refresh", "personal", "L", "☕", "Take a break between study sessions.", "Walk, stretch, hydrate, and return when ready."],
      ["16:00", "18:00", "Focused Revision", "focus", "H", "🎯", "Practise questions, revise important topics, and strengthen understanding for the next exam.", "Prioritise active recall and solving questions over passive reading."],
      ["18:00", "19:00", "Dinner + Family Time", "health", "L", "🍽️", "Have dinner or an evening meal and spend time with family.", "Keep the evening meal aligned with your household schedule.", SLATE],
      ["19:00", "20:30", "Light Revision", "learn", "M", "📑", "Revise short notes, formulas, definitions, and important questions for the next exam.", "Keep the session manageable and avoid unnecessary all-night preparation."],
      ["20:30", "21:00", "Plan Tomorrow", "plan", "L", "📋", "Review preparation progress and plan the next day's revision priorities.", "Prepare required materials and set a realistic study target."],
      ["21:00", "22:00", "Wind Down", "sleep", "L", "🌙", "Relax, reduce screen exposure, and prepare for sleep.", "Avoid unnecessary late-night studying and protect sleep before the next exam."],
    ],
  },

  // ───────────────────────── 5. STUDY LEAVE DAY ─────────────────────────
  {
    name: "Study Leave Day", slug: "study-leave-day", dayType: "CUSTOM", color: "#0EA5E9", icon: "📚",
    description: "A structured academic study day focused on completing the syllabus, revising college subjects, practising questions, finishing assignments, and preparing for upcoming examinations without regular college classes.",
    priority: "Syllabus Completion → Concept Learning → Practice Questions → Revision → Academic Planning",
    rows: [
      ["00:00", "07:00", "Sleep", "sleep", "L", "😴", "Get sufficient overnight sleep to support concentration, learning, and memory.", "Maintain a consistent sleep schedule and avoid late-night studying."],
      ["07:00", "07:15", "Wake Up + Hydration", "health", "M", "🌅", "Wake up, hydrate, and prepare for a productive academic day.", "Start calmly and avoid unnecessary phone use.", SLATE],
      ["07:15", "08:00", "Workout / Morning Walk", "health", "H", "🏋️", "Complete a workout, walk, or light exercise to maintain physical fitness.", "Adjust the intensity according to your energy and recovery needs."],
      ["08:00", "08:30", "Morning Hygiene", "health", "M", "🚿", "Brush your teeth, take a shower, and get ready for the study day.", "Prepare your books, notes, and study environment."],
      ["08:30", "09:00", "Breakfast", "health", "M", "🍳", "Have breakfast and review the day's academic priorities.", "Select the most important subject before beginning the first study session."],
      ["09:00", "11:00", "Deep Study Session 1", "learn", "H", "📖", "Study the most difficult or highest-priority college subject using textbooks, lecture notes, and structured learning resources.", "Focus on understanding concepts, making concise notes, and completing specific syllabus targets."],
      ["11:00", "11:15", "Break / Refresh", "personal", "L", "☕", "Take a short break after focused academic study.", "Stretch, hydrate, and rest your eyes."],
      ["11:15", "13:00", "Practice Questions & Numericals", "assign", "H", "✍️", "Solve subject-related questions, numerical problems, previous-year questions, and important university examination questions.", "Attempt questions independently and record mistakes for later revision.", INDIGO],
      ["13:00", "14:00", "Lunch + Recovery", "personal", "L", "🍱", "Have lunch and take a proper break away from the study desk.", "Use this time to recover before the afternoon sessions."],
      ["14:00", "14:30", "Nap / Rest", "sleep", "L", "😴", "Take a short nap or quiet rest to restore concentration.", "Skip the nap if you feel sufficiently rested."],
      ["14:30", "16:30", "Deep Study Session 2", "learn", "H", "🎯", "Continue syllabus preparation, study a second subject, or complete pending academic topics.", "Use active recall, diagrams, examples, and self-explanation to strengthen understanding."],
      ["16:30", "17:00", "Break / Outdoor Activity", "personal", "L", "🌳", "Step away from the desk and refresh yourself with a walk or light activity.", "Avoid letting the break extend into the next study block."],
      ["17:00", "18:00", "Assignments & Practical Work", "assign", "M", "📝", "Complete college assignments, practical files, lab work, record writing, or pending submissions.", "Prioritise deadlines and verify that required work is complete.", INDIGO],
      ["18:00", "19:00", "Dinner / Evening Meal + Family Time", "health", "L", "🍽️", "Have your evening meal and spend time with family.", "Keep the timing flexible according to your household schedule.", SLATE],
      ["19:00", "20:30", "Revision & Active Recall", "learn", "M", "🔁", "Revise the day's topics, test your memory, practise short-answer questions, and revisit difficult concepts.", "Prioritise recalling information without looking at notes before checking your answers."],
      ["20:30", "21:00", "Daily Review & Next-Day Planning", "plan", "L", "📋", "Review completed topics, identify pending syllabus sections, and prepare the next day's study plan.", "Set three realistic academic priorities for tomorrow."],
      ["21:00", "23:00", "Unplanned Hours / Relaxation", "personal", "F", "🕘", "Flexible time for family, hobbies, relaxation, personal responsibilities, or optional light revision.", "Avoid unnecessary late-night studying and begin winding down before bedtime."],
    ],
  },

  // ───────────────────────── 6. HOLIDAY DAY ─────────────────────────
  {
    name: "Holiday Day", slug: "holiday-day", dayType: "HOLIDAY", color: "#E879F9", icon: "🎉", isDefault: true,
    description: "A flexible holiday routine focused on maintaining essential healthy habits, spending quality time with family, enjoying personal interests, and pursuing optional learning without the pressure of a regular college or placement schedule. Holiday activities can override these suggested blocks without treating them as missed habits.",
    priority: "Health → Family & Personal Time → Hobbies → Optional Learning → Recovery",
    rows: [
      ["00:00", "07:00", "Sleep", "sleep", "L", "😴", "Get sufficient overnight sleep and recover from the week's activities.", "Maintain a consistent sleep schedule without unnecessarily sacrificing rest."],
      ["07:00", "07:15", "Wake Up + Hydration", "health", "M", "🌅", "Wake up, hydrate, and start the holiday at a comfortable pace.", "Avoid immediately getting stuck on your phone.", SLATE],
      ["07:15", "08:00", "Morning Exercise", "health", "H", "🏃", "Go for a walk, run, gym session, or light workout.", "Adjust the intensity according to your recovery needs."],
      ["08:00", "08:30", "Morning Hygiene", "health", "M", "🚿", "Brush your teeth, take a shower, and get ready for the day.", "Maintain basic hygiene habits even on holidays."],
      ["08:30", "09:00", "Breakfast", "health", "M", "🍳", "Have breakfast and discuss or plan any family activities for the day.", "Keep the timing flexible for special occasions."],
      ["09:00", "10:30", "Personal Hobbies", "rec", "F", "🎮", "Enjoy hobbies, gaming, reading, music, creative activities, or other personal interests.", "Choose activities that genuinely help you relax and enjoy the holiday."],
      ["10:30", "11:30", "Optional Learning", "learn", "M", "📖", "Optionally explore a technical topic, read documentation, practise a coding problem, or learn something interesting.", "This block is optional. Do not treat holiday learning as a mandatory target."],
      ["11:30", "13:00", "Family Time / Social Activities", "family", "F", "❤️", "Spend time with family, connect with friends, help with household activities, or participate in holiday preparations.", "Prioritise meaningful interactions over unnecessary screen time."],
      ["13:00", "14:00", "Lunch", "health", "L", "🍱", "Have lunch and enjoy a relaxed midday break.", "Adjust the schedule for family meals, outings, or celebrations."],
      ["14:00", "15:00", "Rest / Nap", "sleep", "L", "😴", "Rest, take a short nap, or spend some quiet time away from screens.", "Use the block according to your energy level; sleeping for the entire hour is not required."],
      ["15:00", "17:00", "Outing / Personal Activities", "rec", "F", "🌳", "Go outside, visit places, meet friends, pursue hobbies, or participate in holiday events.", "Keep this block flexible for travel, celebrations, and unexpected plans."],
      ["17:00", "17:30", "Light Movement / Refresh", "health", "M", "🚶", "Take a short walk, stretch, hydrate, or refresh after afternoon activities.", "Keep the activity light and comfortable."],
      ["17:30", "18:30", "Personal Projects / Creative Time", "personal", "F", "✨", "Work on a personal interest, organise your space, explore a creative idea, or optionally make progress on a project.", "Skip technical work if the holiday is intended for complete rest."],
      ["18:30", "19:30", "Dinner + Family Time", "health", "L", "🍽️", "Have dinner or an evening meal and spend time with family.", "Adjust for celebrations, guests, or your household's normal meal schedule.", SLATE],
      ["19:30", "21:00", "Entertainment / Relaxation", "rec", "F", "🎬", "Enjoy movies, music, reading, games, or other relaxing activities.", "Enjoy entertainment intentionally rather than allowing endless scrolling to consume the evening."],
      ["21:00", "21:30", "Light Planning / Reflection", "plan", "L", "📋", "Reflect on the day and check any important responsibilities for tomorrow.", "Keep planning brief. No detailed productivity review is required on a holiday."],
      ["21:30", "23:00", "Unplanned Hours / Wind Down", "personal", "F", "🌙", "Enjoy free time, spend time with family, relax, or prepare for sleep.", "Keep the time flexible and begin winding down before bedtime."],
    ],
  },

  // ───────────────────────── 7. PROJECT DAY (written from the one-line brief) ─────────────────────────
  {
    name: "Project Day", slug: "project-day", dayType: "CUSTOM", color: "#8B5CF6", icon: "🚀",
    description: "A deep-work day for building RoutineOS or other portfolio projects, debugging, testing, documentation, and shipping features. Choose one measurable deliverable and protect long uninterrupted build sessions.",
    priority: "Plan → Build → Test → Document → Ship → Review",
    rows: [
      ["00:00", "07:00", "Sleep", "sleep", "L", "😴", "Get sufficient overnight sleep to support concentration and problem-solving.", "Avoid sacrificing sleep to squeeze in extra coding."],
      ["07:00", "07:15", "Wake Up + Hydration", "health", "M", "🌅", "Wake up, hydrate, and prepare for a focused build day.", "Avoid extending the wake-up block with phone scrolling.", SLATE],
      ["07:15", "08:00", "Workout / Morning Walk", "health", "H", "🏋️", "Complete a workout or brisk walk to build energy for long focus sessions.", "Keep intensity moderate so energy is saved for deep work."],
      ["08:00", "08:30", "Morning Hygiene", "health", "M", "🚿", "Brush your teeth, take a shower, and get ready for the day.", "Prepare your workspace and close unnecessary tabs and apps."],
      ["08:30", "09:00", "Breakfast", "health", "M", "🍳", "Have breakfast and review where the project stands.", "Do not start coding until the day's goal is clear."],
      ["09:00", "09:30", "Plan Today's Deliverables", "plan", "H", "📋", "Pick one to three measurable deliverables, define what done looks like, and break them into small tasks.", "Prefer shippable outcomes (a working feature, a fixed bug, a deployed page) over vague progress."],
      ["09:30", "12:00", "Deep Build Session 1", "web", "H", "💻", "Implement the highest-priority feature or fix with no context switching.", "Notifications off. Commit small and often. If blocked for more than 30 minutes, change approach or ask for help."],
      ["12:00", "12:30", "Break / Walk", "personal", "L", "☕", "Step away from the screen, stretch, and hydrate.", "Let your mind rest; solutions often appear during the break."],
      ["12:30", "13:30", "Lunch", "health", "L", "🍱", "Have lunch and take a proper break from the computer.", "Avoid working through lunch."],
      ["13:30", "14:00", "Nap / Rest", "sleep", "L", "😴", "Take a short nap or quiet rest to restore afternoon focus.", "Skip the nap if you feel rested."],
      ["14:00", "16:30", "Deep Build Session 2", "web", "H", "⚙️", "Continue feature development, connect frontend, backend, and database, and debug blockers.", "Aim for a working end-to-end path before polishing."],
      ["16:30", "17:00", "Break / Outdoor Activity", "personal", "L", "🌳", "Go outside, walk, and rest your eyes.", "Avoid letting the break extend into the next block."],
      ["17:00", "18:00", "Testing & Bug Fixing", "assign", "H", "🧪", "Test the main user flows, edge cases, and error states, then fix critical bugs.", "Prioritise high-impact bugs over cosmetic issues."],
      ["18:00", "19:00", "Dinner + Family Time", "health", "L", "🍽️", "Have dinner and spend relaxed time with family.", "Disconnect from the project during the meal.", SLATE],
      ["19:00", "20:00", "Documentation, Commits & Deploy", "web", "M", "📝", "Update the README, clean up commits, write notes on decisions, and deploy if the build is stable.", "Never deploy a broken build to meet a self-imposed target."],
      ["20:00", "20:30", "Daily Review & Next Steps", "plan", "L", "📈", "Record what shipped, what is blocked, and the first task for the next project session.", "Write the next task down so tomorrow's start is frictionless."],
      ["20:30", "23:00", "Unplanned Hours / Relaxation", "personal", "F", "🕘", "Flexible time for family, hobbies, entertainment, or rest.", "No mandatory coding. Begin winding down before bedtime."],
    ],
  },

  // ───────────────────────── 8. RECOVERY DAY ─────────────────────────
  {
    name: "Recovery Day", slug: "recovery-day", dayType: "LOW_ENERGY", color: "#10B981", icon: "🧘", isDefault: true,
    description: "A flexible day focused on physical recovery, mental wellbeing, quality sleep, light movement, and restoring energy without pressure.",
    rule: "Recovery is the goal, not productivity. Keep essential health habits, but allow optional activities to be skipped without treating them as missed habits.",
    rows: [
      ["00:00", "07:00", "Sleep & Recovery", "sleep", "L", "😴", "Get uninterrupted sleep and allow the body and mind to recover.", "Prioritize sleep; extend it if genuinely needed."],
      ["07:00", "07:15", "Wake Up & Hydrate", "health", "L", "🌅", "Wake up slowly, drink water, and avoid rushing into tasks.", "Keep the morning calm."],
      ["07:15", "07:45", "Gentle Mobility & Stretching", "health", "L", "🧘", "Do gentle stretching, mobility exercises, or an easy walk.", "Skip intense training if tired or sore."],
      ["07:45", "08:15", "Hygiene & Freshen Up", "health", "L", "🚿", "Complete morning hygiene and get comfortable for the day.", "Keep the routine simple."],
      ["08:15", "09:00", "Breakfast", "health", "M", "🍳", "Eat a balanced breakfast and hydrate.", "Eat without rushing."],
      ["09:00", "10:30", "Relaxed Personal Time", "personal", "L", "☕", "Enjoy quiet time, music, reading, or another low-pressure activity.", "No demanding tasks required."],
      ["10:30", "11:00", "Light Outdoor Walk", "health", "L", "🚶", "Get fresh air and gentle movement.", "Keep the pace comfortable."],
      ["11:00", "12:30", "Hobby or Enjoyment", "rec", "L", "🎨", "Spend time on entertainment, creativity, or a favorite hobby.", "Choose something enjoyable rather than productive."],
      ["12:30", "13:00", "Family & Social Time", "social", "L", "👥", "Connect with family or friends.", "Keep work notifications away if possible."],
      ["13:00", "14:00", "Lunch", "health", "L", "🍱", "Have lunch and take time to relax afterward.", "Avoid immediately starting demanding work."],
      ["14:00", "14:30", "Nap / Quiet Rest", "sleep", "L", "😴", "Take a short nap or rest quietly.", "Skip the nap if it affects nighttime sleep."],
      ["14:30", "15:00", "Mental Wellbeing", "mental", "L", "🌿", "Practice mindfulness, breathing, journaling, or quiet reflection.", "Keep expectations realistic."],
      ["15:00", "17:00", "Flexible Free Time", "personal", "L", "🛋️", "Rest, enjoy a hobby, or do whatever feels restorative.", "No mandatory study or coding."],
      ["17:00", "17:30", "Light Movement", "health", "L", "🚶", "Take a gentle walk or stretch to reduce stiffness.", "Avoid pushing through fatigue."],
      ["17:30", "18:00", "Refresh & Personal Care", "personal", "L", "🧴", "Freshen up and prepare for the evening.", "Keep this time unhurried."],
      ["18:00", "19:00", "Dinner & Family Time", "family", "L", "🍽️", "Have dinner and spend relaxed time with family.", "Prefer a calm, screen-light meal."],
      ["19:00", "20:30", "Relaxing Entertainment", "rec", "L", "🎬", "Watch something, listen to music, read, or enjoy a hobby.", "Avoid activities that make you feel pressured."],
      ["20:30", "20:45", "Gentle Day Reflection", "plan", "L", "📝", "Briefly reflect on energy levels and what helped recovery.", "Optional; do not turn this into a work session."],
      ["20:45", "22:00", "Wind Down", "sleep", "L", "🌙", "Reduce screen exposure and prepare for restful sleep.", "Keep lights and stimulation low."],
      ["22:00", "23:00", "Unplanned / Quiet Time", "personal", "L", "🕘", "Flexible time for anything unfinished or simply relaxing.", "No productivity requirement."],
      ["23:00", "00:00", "Prepare for Sleep", "sleep", "L", "🌙", "Finish bedtime hygiene and settle down for sleep.", "Aim to maintain a consistent sleep schedule."],
    ],
  },

  // ───────────────────────── 9. INTERVIEW DAY ─────────────────────────
  {
    name: "Interview Day", slug: "interview-day", dayType: "CUSTOM", color: "#F97316", icon: "🎤",
    description: "A structured day for interview preparation, DSA practice, technical revision, communication, resume review, and attending interviews with confidence.",
    rule: "The actual interview schedule takes priority. Move or skip preparation blocks as needed; don't treat schedule changes as missed habits.",
    rows: [
      ["00:00", "07:00", "Sleep & Recovery", "sleep", "L", "😴", "Get sufficient sleep to maintain focus and confidence.", "Prioritize rest before an interview."],
      ["07:00", "07:15", "Wake Up & Hydrate", "health", "L", "🌅", "Wake up, drink water, and start calmly.", "Avoid rushing."],
      ["07:15", "07:45", "Workout & Mobility", "health", "M", "🏋️", "Do light exercise or stretching to improve alertness.", "Avoid exhausting workouts."],
      ["07:45", "08:15", "Hygiene & Get Ready", "personal", "L", "🚿", "Complete hygiene and prepare comfortable, presentable clothing.", "Adjust timing if the interview is early.", SLATE],
      ["08:15", "08:45", "Breakfast", "health", "M", "🍳", "Eat a balanced breakfast and hydrate.", "Avoid skipping meals."],
      ["08:45", "09:00", "Interview & Career Plan", "plan", "M", "📋", "Check interview timing, role requirements, and preparation priorities.", "If there is no interview scheduled, choose a mock interview or preparation target."],
      ["09:00", "10:30", "DSA Practice", "dsa", "H", "🧠", "Practice coding problems and explain your approach, complexity, and edge cases.", "Focus on patterns you already know rather than learning many new topics."],
      ["10:30", "10:45", "Break", "personal", "L", "☕", "Take a short break away from the screen.", "Relax your eyes and reset your focus."],
      ["10:45", "12:00", "Technical Interview Revision", "learn", "H", "📚", "Revise JavaScript, React, Next.js, Node.js, databases, APIs, and relevant fundamentals.", "Prioritize technologies listed in the target job description."],
      ["12:00", "13:00", "Lunch & Reset", "health", "L", "🍱", "Eat lunch and relax before the afternoon session.", "Adjust for the actual interview schedule."],
      ["13:00", "14:00", "Project Deep Dive", "assign", "H", "💻", "Review your projects, architecture, important decisions, challenges, and trade-offs.", "Be ready to explain what you personally built without exaggerating."],
      ["14:00", "14:30", "Rest / Short Walk", "sleep", "L", "🌿", "Rest your mind and take a short walk if helpful.", "Skip the nap if it affects nighttime sleep."],
      ["14:30", "16:00", "Mock Interview / Interview Session", "career", "H", "🎯", "Practice technical questions, coding explanations, and follow-up questions, or attend the actual interview.", "Replace this block with the confirmed interview time when necessary."],
      ["16:00", "16:30", "Break & Refresh", "personal", "L", "☕", "Step away from preparation and recover your attention.", "Do not overanalyze interview performance during the break."],
      ["16:30", "17:30", "Resume & Job Applications", "jobs", "M", "💼", "Review your resume, tailor applications, and identify suitable internships or developer roles.", "Keep every claim accurate and verifiable."],
      ["17:30", "18:00", "Communication Practice", "comm", "M", "🗣️", "Practice your introduction, project explanations, and behavioral answers aloud.", "Aim for clear, concise, natural responses."],
      ["18:00", "19:00", "Dinner & Family Time", "family", "L", "🍽️", "Have dinner and spend relaxed time with family.", "Give yourself a break from career pressure."],
      ["19:00", "20:00", "Light Revision", "learn", "M", "📖", "Review concise notes, common questions, and mistakes from practice.", "Avoid starting a large new topic."],
      ["20:00", "20:30", "Interview Review & Progress Log", "plan", "L", "📝", "Record questions, strengths, gaps, and follow-up actions from preparation or the interview.", "If no interview occurred, record mock interview lessons instead."],
      ["20:30", "21:00", "Prepare for Tomorrow", "plan", "L", "📋", "Choose tomorrow's priorities and prepare necessary materials.", "Keep the plan realistic."],
      ["21:00", "23:00", "Unplanned / Relaxation", "personal", "L", "🕘", "Enjoy free time without a productivity target.", "Use this time flexibly."],
      ["23:00", "00:00", "Wind Down & Sleep Preparation", "sleep", "L", "🌙", "Reduce screen time, complete bedtime hygiene, and prepare for sleep.", "Maintain a consistent bedtime."],
    ],
  },

  // ───────────────────────── 10. SICK DAY ─────────────────────────
  {
    name: "Sick Day", slug: "sick-day", dayType: "LOW_ENERGY", color: "#EF4444", icon: "🤒",
    description: "A flexible day focused on rest, hydration, meals, personal care, and recovery when feeling unwell. Work, college, coding, and study are optional.",
    rule: "Recovery comes first. Mark study, DSA, college, workout, and project tasks as excused or skipped for recovery, not missed habits. If symptoms are severe or worsening, prioritize medical care over the routine.",
    rows: [
      ["00:00", "08:00", "Sleep & Recovery", "sleep", "L", "😴", "Sleep and allow your body to rest.", "Wake naturally if possible; rest longer if needed."],
      ["08:00", "08:15", "Wake Up & Hydrate", "health", "L", "💧", "Wake gently and drink water or an appropriate hydrating drink.", "Follow any medical fluid restrictions you have."],
      ["08:15", "08:30", "Basic Hygiene", "personal", "L", "🧼", "Brush your teeth and complete only the personal care you feel comfortable doing.", "Skip anything physically demanding."],
      ["08:30", "09:00", "Breakfast & Medication Check", "health", "L", "🍵", "Eat something suitable and follow existing medication instructions if applicable.", "Do not start or change medication without appropriate medical advice."],
      ["09:00", "11:00", "Rest in Bed", "sleep", "L", "🛏️", "Rest quietly, sleep, or listen to something relaxing.", "No required study, coding, exercise, or work."],
      ["11:00", "11:15", "Hydration & Light Snack", "health", "L", "🥤", "Drink fluids and have a light snack if hungry.", "Keep it comfortable and simple."],
      ["11:15", "13:00", "Quiet Rest / Entertainment", "sleep", "L", "🌿", "Continue resting, with optional light entertainment.", "Reduce screen time if it worsens symptoms."],
      ["13:00", "13:30", "Lunch", "health", "L", "🍲", "Eat a suitable meal and drink fluids.", "Choose foods that you can comfortably tolerate."],
      ["13:30", "15:30", "Afternoon Sleep / Recovery", "sleep", "L", "😴", "Sleep or rest without setting productivity targets.", "Extend this block when your body needs more rest."],
      ["15:30", "15:45", "Wake, Hydrate & Check In", "health", "L", "💧", "Drink fluids and briefly assess how you feel.", "Seek medical advice if symptoms are concerning or worsening."],
      ["15:45", "16:15", "Optional Essential Tasks", "personal", "L", "✅", "Handle only essential messages, urgent updates, or arrangements if you feel able.", "Entirely optional; postpone everything that can wait."],
      ["16:15", "18:00", "Rest & Comfort", "sleep", "L", "🛋️", "Relax in a comfortable environment and rest as needed.", "Avoid strenuous activity."],
      ["18:00", "18:45", "Dinner", "health", "L", "🍲", "Have dinner and maintain comfortable hydration.", "Ask for help preparing food if needed."],
      ["18:45", "20:30", "Evening Recovery", "sleep", "L", "🌙", "Rest, relax, and avoid unnecessary physical or mental effort.", "No mandatory revision or project work."],
      ["20:30", "20:45", "Prepare for Tomorrow", "plan", "L", "📝", "If comfortable, note any urgent commitments to postpone and anything needed for recovery.", "Skip if tired."],
      ["20:45", "22:00", "Wind Down", "sleep", "L", "🌙", "Reduce stimulation and prepare for nighttime sleep.", "Go to bed earlier if needed."],
      ["22:00", "23:00", "Unplanned Rest", "personal", "L", "🛏️", "Use this time for rest, comfort, or anything necessary.", "No tasks are required."],
      ["23:00", "00:00", "Sleep Preparation", "sleep", "L", "😴", "Complete basic bedtime care and settle in for sleep.", "Adjust bedtime to your recovery needs."],
    ],
  },

  // ───────────────────────── 11. TRAVEL DAY ─────────────────────────
  {
    name: "Travel Day", slug: "travel-day", dayType: "CUSTOM", color: "#0EA5E9", icon: "✈️",
    description: "A flexible day for packing, commuting, travelling, managing bookings, and arriving safely while keeping essential routines realistic.",
    rule: "Actual travel times override planned blocks. Keep hydration, meals, safety, and essential documents as priorities; study, workouts, and coding remain optional.",
    rows: [
      ["00:00", "07:00", "Sleep & Recovery", "sleep", "L", "😴", "Get enough sleep before travelling.", "Adjust wake-up time for your departure."],
      ["07:00", "07:15", "Wake Up & Hydrate", "health", "L", "💧", "Wake up, drink water, and check the day's travel schedule.", "If travelling early, move this block earlier."],
      ["07:15", "07:45", "Hygiene & Get Ready", "personal", "L", "🚿", "Complete morning hygiene and get dressed for the journey.", "Keep essentials easily accessible."],
      ["07:45", "08:15", "Breakfast", "health", "M", "🍳", "Eat breakfast and hydrate before leaving.", "Pack a snack if the journey is long."],
      ["08:15", "08:45", "Packing & Travel Checklist", "trip", "M", "🧳", "Check luggage, identification, tickets, phone, charger, wallet, and other essentials.", "Follow destination-specific document requirements."],
      ["08:45", "09:00", "Final Preparation & Departure", "trip", "M", "📋", "Confirm the route, departure time, and transport arrangements.", "Leave a buffer for delays."],
      ["09:00", "12:00", "Main Travel / Commute", "commute", "L", "🚆", "Travel to your destination using the planned transport.", "Replace this block with actual travel times. Never use your phone while driving."],
      ["12:00", "12:30", "Meal & Hydration Break", "health", "L", "🥤", "Eat a snack or meal as appropriate and drink water.", "If in transit, use a safe and suitable stop."],
      ["12:30", "14:00", "Continue Travel / Transit", "commute", "L", "🚌", "Continue the journey or transfer between transport connections.", "Allow for traffic, waiting, and delays."],
      ["14:00", "14:30", "Arrival & Settle In", "trip", "L", "📍", "Reach your destination, collect belongings, and confirm accommodation or arrival arrangements.", "Update the timing based on the actual arrival."],
      ["14:30", "15:30", "Lunch & Recovery", "health", "L", "🍱", "Eat, hydrate, and recover from the journey.", "Prioritize rest after a tiring trip."],
      ["15:30", "16:00", "Unpack & Organize", "personal", "L", "🎒", "Unpack essential items and organize your belongings.", "Leave nonessential unpacking for later."],
      ["16:00", "17:30", "Rest / Free Time", "sleep", "L", "🛋️", "Rest, freshen up, or enjoy some free time after travelling.", "No mandatory study or coding."],
      ["17:30", "18:00", "Local Errands / Essentials", "errands", "M", "🛍️", "Handle necessary local purchases or arrival-related tasks.", "Optional; postpone if tired."],
      ["18:00", "19:00", "Dinner & Social Time", "social", "L", "🍽️", "Have dinner and connect with family, friends, or travel companions.", "Keep the evening relaxed."],
      ["19:00", "19:15", "Check Tomorrow's Plans", "plan", "L", "📝", "Review the next day's departure, appointments, or planned activities.", "Keep planning brief."],
      ["19:15", "21:00", "Relaxation / Unplanned Time", "personal", "L", "🌿", "Relax, socialize, or enjoy entertainment after the journey.", "No productivity requirement."],
      ["21:00", "22:00", "Wind Down", "sleep", "L", "🌙", "Reduce stimulation and prepare for a restful night.", "Sleep earlier after long journeys if needed."],
      ["22:00", "23:00", "Final Essentials & Sleep Preparation", "personal", "L", "🛏️", "Keep travel documents and essentials ready for the next day, then complete bedtime care.", "Skip unnecessary tasks if exhausted."],
      ["23:00", "00:00", "Sleep", "sleep", "L", "😴", "Settle down and get ready for sleep.", "Adjust bedtime to your actual travel schedule."],
    ],
  },

  // ───────────────────────── 12. DEADLINE DAY ─────────────────────────
  {
    name: "Deadline Day", slug: "deadline-day", dayType: "CUSTOM", color: RED, icon: "🎯",
    description: "A focused day for completing urgent assignments, project features, submissions, and deliverables on time while protecting essential breaks and sleep.",
    rule: "Prioritize completion over perfection. Submit early when possible, protect meals and sleep, and treat optional tasks as flexible, not as missed habits.",
    rows: [
      ["00:00", "07:00", "Sleep & Recovery", "sleep", "L", "😴", "Get sufficient sleep to support concentration and decision-making.", "Avoid sacrificing sleep for unnecessary extra work."],
      ["07:00", "07:15", "Wake Up & Hydrate", "health", "L", "💧", "Wake up, hydrate, and prepare for a focused day.", "Keep the morning simple."],
      ["07:15", "07:45", "Light Exercise", "health", "M", "🏃", "Do light exercise or stretching to improve alertness.", "Avoid exhausting yourself before deep work."],
      ["07:45", "08:15", "Hygiene & Get Ready", "personal", "L", "🚿", "Complete morning hygiene and prepare your workspace.", "Keep distractions away from the work area."],
      ["08:15", "08:45", "Breakfast", "health", "M", "🍳", "Eat breakfast and hydrate before starting focused work.", "Do not skip meals to save time."],
      ["08:45", "09:00", "Deadline Planning & Prioritization", "plan", "H", "📋", "List deliverables, due times, dependencies, and the minimum acceptable completion criteria.", "Work on urgent, important tasks first."],
      ["09:00", "11:00", "Deep Work Session 1", "focus", "H", "🎯", "Complete the highest-priority task without unnecessary interruptions.", "Silence nonessential notifications."],
      ["11:00", "11:15", "Short Break", "personal", "L", "☕", "Rest your eyes, stretch, and take a short break.", "Avoid getting pulled into long distractions."],
      ["11:15", "13:00", "Deep Work Session 2", "assign", "H", "💻", "Continue implementation, writing, problem-solving, or assignment completion.", "Focus on finishing deliverables rather than adding unnecessary features."],
      ["13:00", "14:00", "Lunch & Recovery", "health", "L", "🍱", "Eat lunch and briefly disconnect from work.", "Return with a clear next task."],
      ["14:00", "16:00", "Deep Work Session 3", "focus", "H", "🧠", "Finish remaining high-priority work and resolve important blockers.", "If blocked, choose a practical workaround or ask for help early."],
      ["16:00", "16:30", "Break & Refresh", "personal", "L", "🌿", "Take a proper break and refresh before reviewing your work.", "Step away from the screen if possible."],
      ["16:30", "17:30", "Testing & Quality Check", "assign", "H", "🧪", "Check correctness, fix critical bugs, proofread, and verify requirements.", "Prioritize high-impact errors over cosmetic improvements."],
      ["17:30", "18:00", "Submission Preparation", "admin", "M", "📤", "Prepare files, links, documentation, and submission details.", "Check file formats and submission instructions carefully."],
      ["18:00", "19:00", "Dinner & Reset", "health", "L", "🍽️", "Eat dinner and recover from the day's work.", "Adjust this block if the actual deadline requires an earlier submission."],
      ["19:00", "20:30", "Final Work / Submission", "focus", "H", "🚀", "Complete final essential tasks and submit or deliver the work.", "Submit before the deadline and verify confirmation where available."],
      ["20:30", "20:45", "Verify & Record Progress", "plan", "L", "✅", "Confirm submission status and record what is completed or still pending.", "Never assume an upload or deployment succeeded without checking."],
      ["20:45", "21:30", "Buffer / Remaining Essential Work", "assign", "M", "⏳", "Use this buffer for genuine blockers or final corrections.", "If everything is finished, use this time to rest instead."],
      ["21:30", "21:45", "Plan Tomorrow", "plan", "L", "📝", "Set priorities for the next day and move unfinished nonurgent work forward.", "Keep the list short and realistic."],
      ["21:45", "23:00", "Wind Down", "sleep", "L", "🌙", "Relax and disengage from deadline pressure.", "Avoid extending work for unnecessary polish."],
      ["23:00", "00:00", "Sleep Preparation", "sleep", "L", "😴", "Complete bedtime hygiene and prepare for sleep.", "Protect sleep even on demanding days."],
    ],
  },

  // ───────────────────────── 13. HACKATHON DAY ─────────────────────────
  {
    name: "Hackathon Day", slug: "hackathon-day", dayType: "CUSTOM", color: "#7C3AED", icon: "🚀",
    description: "A focused day for team collaboration, idea validation, rapid prototyping, coding, integration, testing, and presenting a working demo.",
    rule: "Build a working MVP first, integrate early, and reserve time for testing and the demo. The official event schedule takes priority over these default blocks.",
    rows: [
      ["00:00", "07:00", "Sleep & Recovery", "sleep", "L", "😴", "Get enough sleep to support creativity and concentration.", "Adjust the schedule to the official hackathon start time."],
      ["07:00", "07:15", "Wake Up & Hydrate", "health", "L", "💧", "Wake up, hydrate, and prepare for the day.", "Keep the start calm and simple."],
      ["07:15", "07:45", "Light Exercise", "health", "M", "🏃", "Stretch or do light exercise to improve alertness.", "Avoid exhausting workouts."],
      ["07:45", "08:15", "Hygiene & Get Ready", "personal", "L", "🚿", "Complete morning hygiene and prepare your workspace or travel bag.", "Pack chargers, headphones, and other essentials if attending in person."],
      ["08:15", "08:45", "Breakfast", "health", "M", "🍳", "Eat breakfast and hydrate before starting the event.", "Plan snacks and meals for longer sessions."],
      ["08:45", "09:15", "Hackathon Setup & Briefing", "plan", "M", "📋", "Review rules, judging criteria, submission requirements, and team responsibilities.", "Replace this block with the actual orientation time."],
      ["09:15", "10:00", "Ideation & Problem Selection", "ideas", "H", "💡", "Define the problem, target users, core idea, and smallest useful solution.", "Choose a feasible idea rather than an overly ambitious one."],
      ["10:00", "10:30", "Architecture & Task Distribution", "assign", "H", "🧩", "Define the MVP, select the stack, split tasks, and agree on integration points.", "Establish ownership and avoid overlapping work."],
      ["10:30", "12:30", "Build Sprint 1 — Core Implementation", "web", "H", "💻", "Build the core functionality and establish a working end-to-end path.", "Prioritize functionality over visual polish."],
      ["12:30", "13:00", "Lunch & Break", "health", "L", "🍱", "Eat and take a short break from the screen.", "Coordinate meal timing with the event schedule."],
      ["13:00", "15:00", "Build Sprint 2 — Feature Development", "web", "H", "⚙️", "Implement remaining MVP features and connect frontend, backend, APIs, or data sources.", "Integrate early rather than waiting until the end."],
      ["15:00", "15:20", "Break & Team Sync", "comm", "L", "🤝", "Review progress, resolve blockers, and coordinate the next tasks.", "Keep the discussion short and actionable."],
      ["15:20", "17:00", "Integration & Testing", "assign", "H", "🧪", "Integrate team contributions, test the main user flow, and fix critical bugs.", "Keep a working build available at all times."],
      ["17:00", "18:00", "Demo Design & Documentation", "design", "M", "🎨", "Improve essential UI details, prepare a README, and document setup and key features.", "Avoid adding features that risk breaking the demo."],
      ["18:00", "18:45", "Dinner & Recharge", "health", "L", "🍽️", "Eat, hydrate, and briefly step away from the project.", "Adjust this block to the event's meal schedule."],
      ["18:45", "20:00", "Final Build & Submission", "web", "H", "🚀", "Verify the final build, deployment, repository, and required submission materials.", "Follow the actual submission deadline and confirm successful submission."],
      ["20:00", "20:45", "Demo & Presentation Practice", "comm", "M", "🎤", "Prepare a concise problem-solution-demo explanation and decide who presents each part.", "Practice the demo using the actual build."],
      ["20:45", "21:00", "Final Checklist & Team Review", "plan", "L", "✅", "Check deliverables, team acknowledgements, repository access, and submission status.", "Skip this block if the event's schedule requires immediate presentation or submission."],
      ["21:00", "22:00", "Relax / Team Wrap-Up", "rec", "L", "🎉", "Celebrate progress, reflect on teamwork, or unwind after the build.", "Optional and dependent on event timing."],
      ["22:00", "23:00", "Wind Down", "sleep", "L", "🌙", "Relax and prepare for sleep after the event.", "Avoid unnecessary late-night polishing."],
      ["23:00", "00:00", "Sleep Preparation", "sleep", "L", "😴", "Complete bedtime hygiene and settle down for rest.", "Shift the routine for overnight hackathons rather than forcing fixed times."],
    ],
  },

  // ───────────────────────── 14. RESET & PLANNING DAY ─────────────────────────
  // The source had no colours, icons or notes for this day; colours come from the
  // category defaults and icons are chosen to match each block.
  {
    name: "Reset & Planning Day", slug: "reset-planning-day", dayType: "CUSTOM", color: "#14B8A6", icon: "📝",
    description: "A flexible reset day to review the past week, organize your space and tasks, prepare for the upcoming week, and recharge without turning the day into another productivity grind.",
    rule: "Reset means preparing for the week, not filling every minute. Pick 3–5 realistic priorities, keep the schedule flexible, and never count optional reset tasks as missed habits.",
    rows: [
      ["00:00", "07:00", "Sleep & Recovery", "sleep", "L", "😴", "Get proper rest before starting the reset day.", "Protect a full night of sleep before a planning day."],
      ["07:00", "07:15", "Wake Up & Hydrate", "health", "L", "🌅", "Get out of bed, drink water, and avoid immediately opening social media.", "Keep the first minutes screen-free."],
      ["07:15", "07:45", "Light Workout & Stretching", "health", "M", "🏋️", "Do light exercise, mobility work, or take a short walk.", "Keep it light; this is a reset day, not a training day."],
      ["07:45", "08:15", "Hygiene & Get Ready", "personal", "L", "🚿", "Brush, bathe, and get dressed for the day.", "Getting dressed helps the day feel intentional."],
      ["08:15", "08:45", "Breakfast", "health", "L", "🍳", "Eat a balanced breakfast and ease into the day.", "Eat without rushing."],
      ["08:45", "09:15", "Weekly Reflection", "plan", "M", "📝", "Review what went well, what felt difficult, and what needs to change.", "Be honest and constructive rather than self-critical."],
      ["09:15", "10:00", "Review Goals & Habits", "plan", "M", "🎯", "Check your habit tracker, progress, unfinished goals, and priorities. Learn from missed days instead of judging yourself.", "Adjust habits that are unrealistic instead of forcing them."],
      ["10:00", "10:15", "Short Break", "personal", "L", "☕", "Step away from screens, stretch, and refresh.", "Keep the break short and screen-free."],
      ["10:15", "11:00", "Organize Tasks & Calendar", "plan", "H", "🗓️", "Check deadlines, college commitments, appointments, and important dates for the upcoming week.", "Move every commitment into the calendar so nothing lives only in your head."],
      ["11:00", "12:00", "Clean Workspace & Digital Files", "maint", "M", "🧹", "Tidy your desk, clear unnecessary downloads, organize study folders, and close out clutter.", "Stop when the space is usable; perfection is not the goal."],
      ["12:00", "13:00", "Personal Admin & Finances", "finance", "M", "💰", "Review expenses, pending personal tasks, messages, bills, and small errands as needed.", "Handle small pending items now so they do not pile up."],
      ["13:00", "14:00", "Lunch", "health", "L", "🍱", "Eat properly and take a break from planning and screens.", "Step away from the desk for the whole meal."],
      ["14:00", "14:30", "Rest & Recharge", "sleep", "L", "😴", "Take a short nap or rest quietly if you feel tired.", "Skip the nap if you feel rested."],
      ["14:30", "15:30", "Organize Study & Project Notes", "assign", "M", "📚", "Sort DSA notes, learning resources, project TODOs, and pending assignments. Do not start a large new task.", "Organise and plan only; avoid starting deep work."],
      ["15:30", "16:00", "Walk & Refresh", "health", "L", "🚶", "Go outside for a walk, stretch, or have a snack.", "Get daylight if possible."],
      ["16:00", "17:00", "Prepare Week Essentials", "chores", "M", "🧺", "Check college supplies, clothes, study materials, groceries, and other essentials for the coming week.", "Make a short list of anything that needs buying or washing."],
      ["17:00", "17:30", "Light Movement", "health", "L", "🚶", "Take a walk or do gentle mobility work without making it an intense workout.", "Keep it gentle."],
      ["17:30", "18:00", "Shower & Freshen Up", "personal", "L", "🚿", "Freshen up and transition into the evening.", "Use this as the switch from planning mode to relaxing mode."],
      ["18:00", "19:00", "Dinner & Family Time", "family", "L", "🍽️", "Have dinner and spend some relaxed time with family.", "Keep screens away during the meal."],
      ["19:00", "19:30", "Set Weekly Priorities", "plan", "M", "📌", "Choose 3–5 realistic priorities and identify the most important task for each day.", "Fewer, clearer priorities beat a long list."],
      ["19:30", "20:00", "Prepare for Tomorrow", "personal", "L", "🎒", "Prepare your bag, clothes, workspace, and first task for the next day.", "Lay out everything needed for the first hour tomorrow."],
      ["20:00", "21:00", "Relax & Free Time", "rec", "L", "🎧", "Enjoy music, entertainment, casual gaming, or unstructured time.", "Enjoy it intentionally rather than scrolling."],
      ["21:00", "22:00", "Reading or Personal Hobby", "reading", "L", "📖", "Read for pleasure or enjoy a low-pressure creative activity. This is optional, not a catch-up session.", "Optional; skip it if you would rather rest."],
      ["22:00", "23:00", "Wind Down", "sleep", "L", "🌙", "Reduce screen time, finish personal care, and keep the remaining hour calm.", "Keep lights and stimulation low."],
      ["23:00", "00:00", "Bedtime Preparation", "sleep", "L", "😴", "Finish your night routine and get ready for sleep. Avoid adding new tasks at the end of the day.", "Do not add new tasks at the end of the day."],
    ],
  },
];

// ───────────── helpers ─────────────
const mins = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
const span = (s: string, e: string) => {
  const d = mins(e) - mins(s);
  return d > 0 ? d : d + 1440;
};
/** Emoji-, spacing- and case-insensitive key so "🟢 Health" and "Health" match. */
const catKey = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}/&\s]/gu, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });

  // Reuse the user's existing categories where possible.
  const existing = await prisma.category.findMany({ where: { userId: user.id } });
  const catByKey = new Map(existing.map((c) => [catKey(c.name), c.id]));
  const catIdCache = new Map<K, string>();

  async function categoryId(k: K): Promise<string> {
    const cached = catIdCache.get(k);
    if (cached) return cached;
    const [label, icon, color] = CATS[k];
    let id = catByKey.get(catKey(label));
    if (!id) {
      const name = `${icon} ${label}`;
      const created = await prisma.category.create({
        data: { userId: user.id, name, nameNormalized: name.trim().toLowerCase(), icon, color },
      });
      id = created.id;
      catByKey.set(catKey(label), id);
    }
    catIdCache.set(k, id);
    return id;
  }

  for (const [i, day] of DAYS.entries()) {
    const description = [
      day.description,
      day.priority ? `Daily priority: ${day.priority}` : null,
      day.rule ? `Rule: ${day.rule}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const def = await prisma.dayTypeDefinition.upsert({
      where: { userId_slug: { userId: user.id, slug: day.slug } },
      update: { name: day.name, description, color: day.color, icon: day.icon, sortOrder: i },
      create: {
        userId: user.id,
        name: day.name,
        slug: day.slug,
        description,
        color: day.color,
        icon: day.icon,
        isDefault: day.isDefault === true && day.slug === "college-day",
        sortOrder: i,
      },
    });

    const template = await prisma.routineTemplate.findFirst({
      where: { userId: user.id, dayTypeId: def.id, name: day.name },
    });

    if (template && !REPLACE) {
      console.log(`↷ ${day.name}: template exists, skipped (REPLACE=1 to rebuild blocks)`);
      continue;
    }

    const blocks = await Promise.all(
      day.rows.map(async ([start, end, title, cat, en, icon, desc, notes, color], idx) => ({
        userId: user.id,
        startTime: start,
        endTime: end,
        isOvernight: mins(end) <= mins(start),
        title,
        description: desc,
        notes: notes ?? null,
        sortOrder: idx,
        color: color ?? CATS[cat][2],
        icon,
        categoryId: await categoryId(cat),
        energyLevel: ENERGY[en],
        trackCompletion: true,
        isRecurring: true,
      })),
    );
    const estimatedDuration = day.rows.reduce((sum, r) => sum + span(r[0], r[1]), 0);

    await prisma.$transaction(async (tx) => {
      let templateId = template?.id;
      if (templateId) {
        await tx.routineBlock.deleteMany({ where: { templateId } });
        await tx.routineTemplate.update({
          where: { id: templateId },
          data: { description, color: day.color, icon: day.icon, dayType: day.dayType, estimatedDuration },
        });
      } else {
        const created = await tx.routineTemplate.create({
          data: {
            userId: user.id,
            name: day.name,
            description,
            dayType: day.dayType,
            dayTypeId: def.id,
            isDefault: day.isDefault === true,
            color: day.color,
            icon: day.icon,
            estimatedDuration,
          },
        });
        templateId = created.id;
      }
      await tx.routineBlock.createMany({ data: blocks.map((b) => ({ ...b, templateId: templateId! })) });
    });

    console.log(`✓ ${day.name}: ${blocks.length} blocks`);
  }

  console.log(`Done for ${EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());