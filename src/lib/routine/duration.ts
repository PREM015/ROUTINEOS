import { RoutineBlock } from "@/types/routine";
import { timeToMinutes } from "./conflict";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function calculateBlockDuration(block: RoutineBlock): number {
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  return Math.max(0, end - start);
}

export function calculateTemplateDuration(blocks: RoutineBlock[]): number {
  return blocks.reduce((total, block) => total + calculateBlockDuration(block), 0);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function getCurrentBlock(blocks: RoutineBlock[], now: Date, timezone: string): RoutineBlock | null {
  const currentTimeString = formatInTimeZone(now, timezone, 'HH:mm');
  const currentMinutes = timeToMinutes(currentTimeString);

  return blocks.find(block => {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    return currentMinutes >= start && currentMinutes < end;
  }) || null;
}

export function getNextBlock(blocks: RoutineBlock[], now: Date, timezone: string): RoutineBlock | null {
  const currentTimeString = formatInTimeZone(now, timezone, 'HH:mm');
  const currentMinutes = timeToMinutes(currentTimeString);

  const upcomingBlocks = blocks.filter(block => timeToMinutes(block.startTime) >= currentMinutes);
  upcomingBlocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  return upcomingBlocks[0] || null;
}
