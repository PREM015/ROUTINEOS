import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { TaskRepository } from '@/server/repositories/task.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { TemplateRepository } from '@/server/repositories/template.repository';
import { globalSearchSchema } from '@/schemas/search.schema';
import type { GlobalSearchInput } from '@/schemas/search.schema';

/**
 * Search Service
 * Global and per-entity search across a user's content
 */

type CategoryKey =
  | 'habit'
  | 'goal'
  | 'project'
  | 'task'
  | 'journal'
  | 'template'
  | 'routine'
  | 'reflection'
  | 'mood'
  | 'sleep'
  | 'tag'
  | 'category';

export class SearchService {
  private habitRepository: HabitRepository;
  private goalRepository: GoalRepository;
  private projectRepository: ProjectRepository;
  private taskRepository: TaskRepository;
  private journalRepository: JournalRepository;
  private templateRepository: TemplateRepository;

  constructor() {
    this.habitRepository = new HabitRepository();
    this.goalRepository = new GoalRepository();
    this.projectRepository = new ProjectRepository();
    this.taskRepository = new TaskRepository();
    this.journalRepository = new JournalRepository();
    this.templateRepository = new TemplateRepository();
  }

  /**
   * Search across all supported content categories for a user
   */
  async globalSearch(userId: string, input: GlobalSearchInput) {
    const { query, type, limit = 5, offset = 0 } = globalSearchSchema.parse(input);

    const targets: CategoryKey[] =
      type && type !== 'all'
        ? [type as CategoryKey]
        : (Object.keys(this.searchFns) as CategoryKey[]);

    const results: Partial<Record<CategoryKey, unknown>> = {};

    for (const target of targets) {
      const search = this.searchFns[target];
      results[target] = search
        ? await search(userId, query, limit, offset)
        : [];
    }

    return { query, type: type ?? 'all', results };
  }

  /**
   * Search habits (client-side: repository has no search filter)
   */
  async searchHabits(
    userId: string,
    term: string,
    limit: number,
    offset = 0
  ) {
    const parsed = globalSearchSchema.parse({ query: term });
    const q = parsed.query.toLowerCase();

    const habits = await this.habitRepository.findAll(userId, {
      includeArchived: false,
      limit: 200,
    });

    return habits
      .filter(
        (habit) =>
          habit.name.toLowerCase().includes(q) ||
          (habit.description?.toLowerCase().includes(q) ?? false)
      )
      .slice(offset, offset + limit);
  }

  /**
   * Search goals (client-side: repository has no search filter)
   */
  async searchGoals(
    userId: string,
    term: string,
    limit: number,
    offset = 0
  ) {
    const parsed = globalSearchSchema.parse({ query: term });
    const q = parsed.query.toLowerCase();

    const goals = await this.goalRepository.findAll(userId, { limit: 200 });

    return goals
      .filter(
        (goal) =>
          goal.title.toLowerCase().includes(q) ||
          (goal.description?.toLowerCase().includes(q) ?? false)
      )
      .slice(offset, offset + limit);
  }

  /**
   * Search projects
   */
  async searchProjects(
    userId: string,
    term: string,
    limit: number,
    offset = 0
  ) {
    return this.projectRepository.findAll(userId, {
      search: term,
      limit,
      offset,
    });
  }

  /**
   * Search tasks
   */
  async searchTasks(
    userId: string,
    term: string,
    limit: number,
    offset = 0
  ) {
    return this.taskRepository.findAll(userId, {
      search: term,
      limit,
      offset,
    });
  }

  /**
   * Search journal entries
   */
  async searchJournal(
    userId: string,
    term: string,
    limit: number,
    offset = 0
  ) {
    const entries = await this.journalRepository.search(
      userId,
      term,
      (offset + limit) || undefined
    );
    return offset > 0 ? entries.slice(offset, offset + limit) : entries;
  }

  /**
   * Search routine templates
   */
  async searchTemplates(
    userId: string,
    term: string,
    limit: number,
    offset = 0
  ) {
    return this.templateRepository.findAll(userId, {
      search: term,
      limit,
      offset,
    });
  }

  /**
   * Dispatch table for category-targeted searches
   */
  private searchFns: Record<
    CategoryKey,
    ((userId: string, term: string, limit: number, offset: number) => Promise<unknown>) | undefined
  > = {
    habit: (userId, term, limit, offset) =>
      this.searchHabits(userId, term, limit, offset),
    goal: (userId, term, limit, offset) =>
      this.searchGoals(userId, term, limit, offset),
    project: (userId, term, limit, offset) =>
      this.searchProjects(userId, term, limit, offset),
    task: (userId, term, limit, offset) =>
      this.searchTasks(userId, term, limit, offset),
    journal: (userId, term, limit, offset) =>
      this.searchJournal(userId, term, limit, offset),
    template: (userId, term, limit, offset) =>
      this.searchTemplates(userId, term, limit, offset),
    routine: undefined,
    reflection: undefined,
    mood: undefined,
    sleep: undefined,
    tag: undefined,
    category: undefined,
  };
}