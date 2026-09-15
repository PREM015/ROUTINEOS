export default function GoalPriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    LOW: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    HIGH: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[priority] || colors.LOW}`}>
      {priority}
    </span>
  );
}
