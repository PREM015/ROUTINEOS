import { RoutineTemplate, RoutineException, DayType } from "@/types/routine";
import { getDay } from "date-fns";

export function getDayTypeForDate(date: string, exceptions: RoutineException[], _userTimezone: string): DayType {
  const dateObj = new Date(date);
  
  // Check for exceptions first
  const exception = exceptions.find(e => e.date === date);
  if (exception) {
    return exception.dayType;
  }
  
  const dayOfWeek = getDay(dateObj); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'WEEKEND';
  }
  return 'WORKDAY';
}

export function getDefaultTemplate(templates: RoutineTemplate[], dayType: string): RoutineTemplate | null {
  return templates.find(t => t.dayType === dayType && t.isDefault && t.isActive) || null;
}

export function getTemplateForDate(templates: RoutineTemplate[], date: string, exceptions: RoutineException[], userTimezone: string): RoutineTemplate | null {
  // Check for specific exception overriding the template
  const exception = exceptions.find(e => e.date === date);
  if (exception && exception.templateId) {
    const template = templates.find(t => t.id === exception.templateId);
    if (template && template.isActive) return template;
  }
  
  const dayType = getDayTypeForDate(date, exceptions, userTimezone);
  return getDefaultTemplate(templates, dayType);
}
