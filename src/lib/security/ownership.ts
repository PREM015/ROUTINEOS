export async function verifyHabitOwnership(userId: string, habitId: string, db: any) {
  const habit = await db.habit.findUnique({ where: { id: habitId } });
  if (!habit || habit.userId !== userId) {
    throw new Error('FORBIDDEN');
  }
  return habit;
}

export async function verifyGoalOwnership(userId: string, goalId: string, db: any) {
  const goal = await db.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.userId !== userId) {
    throw new Error('FORBIDDEN');
  }
  return goal;
}

export async function verifyRoutineOwnership(userId: string, routineId: string, db: any) {
  const routine = await db.routineTemplate.findUnique({ where: { id: routineId } });
  if (!routine || routine.userId !== userId) {
    throw new Error('FORBIDDEN');
  }
  return routine;
}
