'use client';

/**
 * CelebrationHost — renders unlock celebration toasts anywhere in the
 * dashboard.
 *
 * Watches the achievement store: when `runAchievementCheck()` pushes a newly
 * unlocked achievement, this host passes it to the existing AchievementPopup
 * (auto-hide + dismiss). Mounted once in the dashboard layout. With no events
 * queued, the popup's own fallback surfaces the most-recent unlock that the
 * user has not seen yet.
 */

import { useAchievementStore } from '@/store/achievement.store';
import { AchievementPopup } from './AchievementPopup';

export function CelebrationHost() {
  const events = useAchievementStore((state) => state.events);
  const dismissFirst = useAchievementStore((state) => state.dismissFirst);

  const current = events[0] ?? null;

  return (
    <AchievementPopup
      achievement={current}
      onDismiss={dismissFirst}
      autoHideMs={8000}
    />
  );
}

export default CelebrationHost;