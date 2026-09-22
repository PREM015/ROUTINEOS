export type RoutineTimeBlock = {
  id?: string;
  startTime: string;
  endTime: string;
  isOvernight?: boolean;
};

type Interval = [number, number];

function minutes(value: string): number {
  const [hours = 0, minutesPart = 0] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutesPart) || hours < 0 || hours > 23 || minutesPart < 0 || minutesPart > 59) {
    throw new Error('Times must use HH:mm format.');
  }
  return hours * 60 + minutesPart;
}

function intervalsFor(block: RoutineTimeBlock): Interval[] {
  const start = minutes(block.startTime);
  const end = minutes(block.endTime);
  const overnight = Boolean(block.isOvernight) || end <= start;
  if (!overnight) return [[start, end]];
  if (start === end) return [[0, 1440]];
  return [[start, 1440], [0, end]];
}

export function routineBlocksConflict(left: RoutineTimeBlock, right: RoutineTimeBlock): boolean {
  if (left.id && left.id === right.id) return false;
  return intervalsFor(left).some(([leftStart, leftEnd]) =>
    intervalsFor(right).some(([rightStart, rightEnd]) => leftStart < rightEnd && rightStart < leftEnd),
  );
}

export function findRoutineConflicts<T extends RoutineTimeBlock>(candidate: T, blocks: T[]): T[] {
  return blocks.filter((block) => routineBlocksConflict(candidate, block));
}
