// PRODUCTION-PATH end-to-end test setup for the RoutineOS notification system.
//
// This does NOT call webpush directly. It:
//   1. creates a clearly-marked temporary Goal (real Goal model)
//   2. runs the REAL goal reminder producer to create the NotificationLog row
//   3. only then moves the row's `scheduledFor` a few minutes into the future,
//      so the user has time to close the browser
//   4. verifies the dispatcher WILL pick it up (PENDING + scheduledFor <= now)
//
// The producer, dispatcher, VAPID push and service worker are all the real ones.
// Throwaway - deleted during cleanup.
import { config } from 'dotenv';
config({ path: '.env' });

const { PrismaClient } = await import('../src/generated/prisma/index.js');
const { PrismaPg } = await import('@prisma/adapter-pg');
const { fromZonedTime } = await import('date-fns-tz');
const { scheduleGoalReminders } = await import('../src/server/notifications/goal-reminder.ts');
const { getTodayString } = await import('../src/lib/dates.ts');

const LEAD_MINUTES = Number(process.argv[2] || 4);
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const TEST_TITLE = '[ROUTINEOS NOTIFICATION TEST] Goal';
const out = { createdGoalIds: [], createdNotifIds: [] };
let failures = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? '  ' + extra : ''}`);
};

try {
  const users = await p.user.findMany({
    where: { isActive: true, isDeleted: false },
    select: {
      id: true, email: true,
      settings: { select: { timezone: true, notificationsEnabled: true, goalReminders: true, pushNotifications: true } },
    },
  });
  console.log(`eligible users: ${users.length}\n`);

  for (const user of users) {
    const tz = user.settings?.timezone || 'UTC';
    const todayLocal = getTodayString(tz);
    console.log(`--- ${user.email} (tz ${tz}, today ${todayLocal}) ---`);

    // 1. Clean up any previous test run so a rerun is clean.
    const prevGoals = await p.goal.findMany({ where: { userId: user.id, title: TEST_TITLE }, select: { id: true } });
    for (const g of prevGoals) await p.goal.delete({ where: { id: g.id } });
    await p.notificationLog.deleteMany({ where: { userId: user.id, relatedEntityId: { startsWith: 'goal:' }, type: 'GOAL_DEADLINE', title: { in: ['Goal deadline approaching', 'Goal overdue'] } } });

    // 2. Real Goal row. endDate = today so the producer is inside its window.
    const startInstant = fromZonedTime(`${todayLocal}T00:00:00.000`, tz);
    const goal = await p.goal.create({
      data: {
        userId: user.id,
        title: TEST_TITLE,
        description: 'Temporary automated goal used only to verify end-to-end push notifications.',
        type: 'DAILY',
        priority: 'HIGH',
        status: 'ACTIVE',
        targetValue: 1,
        currentValue: 0,
        unit: 'test',
        startDate: startInstant,
        endDate: startInstant,
      },
      select: { id: true, title: true, endDate: true },
    });
    out.createdGoalIds.push(goal.id);
    console.log(`  goal created: ${goal.id}`);
    console.log(`    endDate stored: ${goal.endDate.toISOString()}`);

    // 3. THE REAL PRODUCER creates the NotificationLog row.
    const res = await scheduleGoalReminders(new Date());
    console.log(`  producer: created=${res.created} considered=${res.considered} skippedBySettings=${res.skippedBySettings}`);

    const rows = await p.notificationLog.findMany({
      where: { userId: user.id, type: 'GOAL_DEADLINE', status: 'PENDING' },
      select: { id: true, title: true, body: true, scheduledFor: true, status: true, actionUrl: true, relatedEntityId: true },
    });
    check('producer created a PENDING GOAL_DEADLINE row', rows.length > 0, `got ${rows.length}`);
    if (rows.length === 0) continue;
    const row = rows[0];
    out.createdNotifIds.push(row.id);
    console.log(`    id            : ${row.id}`);
    console.log(`    title         : ${row.title}`);
    console.log(`    body          : ${row.body}`);
    console.log(`    actionUrl     : ${row.actionUrl}`);
    console.log(`    relatedEntity : ${row.relatedEntityId}`);
    console.log(`    status        : ${row.status}`);
    console.log(`    scheduledFor  : ${row.scheduledFor.toISOString()}`);

    // 4. Move delivery LEAD_MINUTES out so the user can close the browser.
    const fireAt = new Date(Date.now() + LEAD_MINUTES * 60_000);
    await p.notificationLog.update({ where: { id: row.id }, data: { scheduledFor: fireAt } });
    const updated = await p.notificationLog.findUnique({ where: { id: row.id }, select: { scheduledFor: true, status: true } });
    console.log(`  RESCHEDULED to : ${updated.scheduledFor.toISOString()}  (${LEAD_MINUTES} min from now)`);

    // 5. Timezone proof: the instant must map to a sensible IST wall clock.
    const wallAtFire = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, day: '2-digit', month: '2-digit' }).format(updated.scheduledFor);
    const nowWall = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, day: '2-digit', month: '2-digit' }).format(new Date());
    console.log(`  now in ${tz}      : ${nowWall}`);
    console.log(`  fires in ${tz}   : ${wallAtFire}`);
    const deltaMin = Math.round((updated.scheduledFor.getTime() - Date.now()) / 60000);
    check('scheduledFor is ~N minutes in the future', Math.abs(deltaMin - LEAD_MINUTES) <= 1, `delta=${deltaMin}min`);
    check('no 5h30m offset: UTC instant is 330 min BEHIND IST wall clock',
      Math.round((Date.UTC(
        Number(wallAtFire.slice(6, 8)), Number(wallAtFire.slice(3, 5)) - 1, Number(wallAtFire.slice(0, 2)),
        Number(wallAtFire.slice(9, 11)), Number(wallAtFire.slice(12, 14))
      ) - updated.scheduledFor.getTime()) / 60000) === (tz === 'Asia/Kolkata' ? 330 : 0),
      `offset=${Math.round((Date.UTC(
        Number(wallAtFire.slice(6, 8)), Number(wallAtFire.slice(3, 5)) - 1, Number(wallAtFire.slice(0, 2)),
        Number(wallAtFire.slice(9, 11)), Number(wallAtFire.slice(12, 14))
      ) - updated.scheduledFor.getTime()) / 60000)}min`);

    // 6. Dispatcher precondition.
    const dueNow = await p.notificationLog.count({ where: { id: row.id, status: 'PENDING', scheduledFor: { lte: new Date() } } });
    check('NOT yet due (correct: it waits for the scheduled time)', dueNow === 0, `dueNow=${dueNow}`);

    // 7. Subscription present (count only, never the endpoint).
    const subs = await p.pushSubscription.count({ where: { userId: user.id, isActive: true } });
    check('user has an active push subscription', subs > 0, `count=${subs}`);

    // 8. Settings gates that the dispatcher will apply.
    console.log(`  gates: notificationsEnabled=${user.settings?.notificationsEnabled} goalReminders=${user.settings?.goalReminders} pushNotifications=${user.settings?.pushNotifications}`);

    console.log(`\n  >>> EXPECT WINDOWS NOTIFICATION AROUND: ${wallAtFire} ${tz}`);
  }

  console.log(`\n${failures === 0 ? 'ALL PRE-FLIGHT CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  console.log(JSON.stringify(out));
} catch (e) {
  console.log('FAILED:', String(e.message).slice(0, 500));
} finally {
  await p.$disconnect();
}
