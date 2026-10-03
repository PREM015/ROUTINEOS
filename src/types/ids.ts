/**
 * Branded identifiers.
 *
 * Every id in this schema is a `cuid()`, so every method that takes more than one id
 * has a signature the compiler cannot tell apart from any other ordering:
 * `(userId: UserId, sessionId: string)`. Passing those two arguments in the wrong
 * order typechecks perfectly and reads or writes the wrong row at runtime. That is
 * the single parameter-order mistake TypeScript is structurally blind to, and it has
 * already happened in this codebase.
 *
 * A brand closes it: `UserId` is still a `string` at runtime, so nothing about
 * serialization, JWTs or Prisma changes, but a plain `string` is no longer accepted
 * where a `UserId` is required.
 *
 * ## Why only `userId`, and why inbound parameters only
 *
 * Outbound values (model fields, repository return types) stay `string`. Branding
 * them would force a conversion at every Prisma row read, because `row.userId` comes
 * back as a plain `string`, and would cascade through every repository for no gain: a
 * returned id flows *outward* into display code, where a wrong value is a wrong label
 * rather than a wrong-row write. The defect being prevented is an argument passed into
 * the wrong slot, which is entirely an inbound concern.
 *
 * ## The naming rule
 *
 * Brand a parameter **if and only if it is named exactly `userId`**. Five signatures
 * take two user ids - `(actorId, userId)` and `(userId, otherUserId)` in the admin
 * and social domains. Those are precisely the cases this brand protects, and it only
 * protects them because `actorId` and `otherUserId` are left as plain `string`.
 * Branding both would make those swaps undetectable again.
 */
declare const userIdBrand: unique symbol;

/**
 * A user id.
 *
 * `unique symbol` rather than the more common `__brand: 'UserId'` string-literal form,
 * because the literal form is structurally forgeable: any object literal claiming
 * `{ __brand: 'UserId' }` satisfies it. A `unique symbol` makes the type genuinely
 * nominal.
 *
 * Still assignable to `string` everywhere, which is what lets branded ids flow into
 * Prisma `where` clauses and template literals with no cast layer.
 */
export type UserId = string & { readonly [userIdBrand]: true };

/**
 * The single sanctioned way to turn a raw `string` into a `UserId`.
 *
 * Use this function rather than an `as UserId` cast. A cast defeats the entire brand:
 * `fn(sessionId as UserId, userId)` compiles with no error, whereas the same call
 * without the cast is a compile error. Preferring a named function keeps that failure
 * mode visible in review and greppable.
 */
export function toUserId(raw: string): UserId {
  return raw as UserId;
}

/**
 * The optional counterpart: `undefined` and `null` pass through as `undefined`.
 *
 * Needed wherever a user id is genuinely absent rather than temporarily unknown - an
 * unauthenticated error report, a feature-flag context evaluated with no signed-in
 * user, a dispatch scoped to "every user". Those are different from a missing id on an
 * authenticated request, which is a bug and should be loud.
 *
 * Written as a function rather than `raw ? toUserId(raw) : undefined` at each of the
 * call sites so the "absent is legitimate here" decision is recorded once.
 */
export function toUserIdOptional(raw: string | null | undefined): UserId | undefined {
  return raw == null ? undefined : toUserId(raw);
}

/**
 * The `UserId` for an authenticated session.
 *
 * Throws rather than branding a missing id. Every route already rejects an absent
 * session with a 401 before reaching the service layer, so reaching this with no user
 * is a bug rather than a user error, and silently branding `undefined` would turn that
 * bug into a query against a nonexistent user instead of a loud failure.
 *
 * Takes the *session* rather than `session.user.id` deliberately: it cannot accept the
 * id, because a helper cannot see the caller's narrowing. All 199 in-repo routes that
 * reach a service narrow the session itself (`if (!session?.user?.id) return 401`),
 * which is what makes this shape usable there.
 */
export function userIdFromSession(session: {
  user: { id: string };
}): UserId {
  return toUserId(session.user.id);
}