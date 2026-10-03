const path = require('path');
const fsx = require('fs');
for (const line of fsx.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = require(path.join(process.cwd(), 'src/generated/prisma'));
const { PrismaPg } = require(path.join(process.cwd(), 'node_modules/@prisma/adapter-pg'));
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });
const q = (sql) => p.$queryRawUnsafe(sql);
(async () => {
  try {
    console.log('focusSession rows :', await p.focusSession.count());
    console.log('break rows        :', await p.break.count());
    console.log('user rows         :', await p.user.count());
    const t = await q('SELECT title, count(*)::int AS n FROM "FocusSession" GROUP BY title ORDER BY n DESC LIMIT 10');
    console.log('--- FocusSession.title values ---');
    if (!t.length) console.log('   (empty)');
    t.forEach(r => console.log('  ', JSON.stringify(r.title), '=', r.n));
    const bt = await q('SELECT "breakType", count(*)::int AS n FROM "Break" GROUP BY "breakType"');
    console.log('--- Break.breakType values ---');
    if (!bt.length) console.log('   (table empty)');
    bt.forEach(r => console.log('  ', JSON.stringify(r.breakType), '=', r.n));
    const g = await q('SELECT count(*)::int AS n FROM "FocusSession" WHERE "completedAt" IS NULL AND "abortedAt" IS NULL AND "actualDuration" IS NOT NULL');
    console.log('--- frozen rows to recover as abortedAt ---', g[0].n);
    const a = await q('SELECT count(*)::int AS n FROM "FocusSession" WHERE "completedAt" IS NULL AND "abortedAt" IS NULL AND "actualDuration" IS NULL');
    console.log('--- ambiguous rows (left for review) ---', a[0].n);
    const d = await q('SELECT "userId", count(*)::int AS n FROM "FocusSession" WHERE "completedAt" IS NULL AND "abortedAt" IS NULL GROUP BY "userId" HAVING count(*) > 1');
    console.log('--- users violating one-active-per-user ---', d.length, JSON.stringify(d.slice(0,5)));
  } catch (e) {
    console.log('ERROR:', String(e.message).split('\n').slice(0,6).join(' | '));
  } finally { await p.$disconnect(); }
})();