const path = require('path'); const fsx = require('fs');
for (const line of fsx.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = require(path.join(process.cwd(), 'src/generated/prisma'));
const { PrismaPg } = require(path.join(process.cwd(), 'node_modules/@prisma/adapter-pg'));
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const u = await p.user.findFirst();
  try {
    const c = await p.focusSession.create({ data: { userId: u.id, title: 'Focus session', type: 'FOCUS', plannedDuration: 25, startedAt: new Date() } });
    console.log('created:', c.id.slice(0,8), '| type=', c.type, '| pausedTotal=', c.pausedTotalSeconds, '| source=', c.source);
    const a = await p.focusSession.findFirst({ where: { userId: u.id, completedAt: null, abortedAt: null } });
    console.log('active lookup:', a ? a.id.slice(0,8) : null);
    try { await p.focusSession.create({ data: { userId: u.id, title: 'second', type: 'FOCUS', plannedDuration: 25, startedAt: new Date() } }); console.log('!! FAIL: second active row ALLOWED'); }
    catch (e) { console.log('second active row REJECTED:', String(e.message).includes('one_active_session_per_user') ? 'by one_active_session_per_user' : 'other: ' + String(e.message).slice(-140)); }
    await p.focusSession.delete({ where: { id: c.id } });
    console.log('test row cleaned up');
  } catch (e) {
    console.log('FULL ERROR:');
    console.log(String(e.message).slice(-900));
  } finally { await p.$disconnect(); }
})();