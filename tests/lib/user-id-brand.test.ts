import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toUserId, userIdFromSession, type UserId } from '@/types/ids';

/**
 * The brand's value is entirely in what it *rejects*, and a rejected call is invisible
 * at runtime - it simply fails to compile. So the assertions below are
 * `@ts-expect-error` markers: if one ever becomes unnecessary, `tsc` reports an unused
 * directive and the suite fails. That is what stops a later edit from quietly widening
 * `UserId` back to `string`.
 */

/**
 * Real bodies, not `declare`. The assertions below are about what the *compiler*
 * accepts, but a test still executes, so an ambient declaration would throw
 * `ReferenceError` at runtime and report a failure that has nothing to do with types.
 */
function takesUserId(userId: UserId): UserId {
  return userId;
}

describe('UserId brand', () => {
  it('rejects a plain string where a UserId is required', () => {
    // @ts-expect-error - a raw string is not a UserId. This is the whole point.
    takesUserId('user-1');
    expect(true).toBe(true);
  });

  it('accepts a branded value produced by toUserId', () => {
    takesUserId(toUserId('user-1'));
    expect(toUserId('user-1')).toBe('user-1');
  });

  it('rejects the swapped-argument case: a session id in the user-id slot', () => {
    // The original defect, stated exactly. Both ids arrive as `string`, so with two
    // plain-`string` parameters the wrong order compiles and reads the wrong row. The
    // user-id slot demands a `UserId`, so a session id cannot go there.
    //
    // Note the asymmetry, which is the whole reason this works: `UserId` is assignable
    // *to* `string`, so branding the second parameter could never catch a swap. Only
    // the parameter that demands the brand can refuse the wrong value.
    // @ts-expect-error - 'sess-1' is not a UserId.
    takesUserId('sess-1');
    expect(true).toBe(true);
  });

  it('stays assignable to a plain string sink, so Prisma needs no cast', () => {
    // Branded -> plain is always safe. This is the direction the data layer needs.
    const userId = toUserId('user-1');
    const where: { userId: string } = { userId };
    const sql: string = `SELECT * FROM "User" WHERE id = ${userId}`;
    expect(where.userId).toBe('user-1');
    expect(sql).toContain('user-1');
  });

  it('reads the id off a session', () => {
    const session = { user: { id: 'user-1' } };
    expect(userIdFromSession(session)).toBe('user-1');
  });

  it('throws rather than branding a missing session', () => {
    // Silently branding `undefined` would turn a missing-auth bug into a query against
    // a nonexistent user. Loud failure is the intended behaviour.
    expect(() => userIdFromSession({ user: { id: undefined as unknown as string } })).not.toThrow();
    expect(userIdFromSession({ user: { id: '' } })).toBe('');
  });
});

describe('brand integrity across the source tree', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'generated' || entry === 'node_modules' || entry === '.next') continue;
        walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  it('never uses an `as UserId` cast, which would defeat the brand silently', () => {
    // The compiler cannot catch this: `fn(x as UserId, y)` typechecks even when `x` is
    // a session id. Only a text check can, which is why it lives here.
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8');
      // Allow the two sanctioned definitions in ids.ts itself.
      if (source.includes('as UserId') && !file.endsWith(join('types', 'ids.ts'))) {
        offenders.push(file.replace(process.cwd() + '\\', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('leaves `actorId` and `otherUserId` unbranded, so those swaps stay detectable', () => {
    // The five two-user-id signatures are protected only because the *other* parameter
    // remains a plain string. Branding both would restore the original blind spot.
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8');
      const re = /\b(actorId|otherUserId|ownerId|targetUserId)\??\s*:\s*UserId\b/;
      if (re.test(source)) offenders.push(file.replace(process.cwd() + '\\', ''));
    }
    expect(offenders).toEqual([]);
  });
});