/**
 * API-key constants shared by the issue route and the verification service.
 *
 * The prefix lets a presented key be rejected as malformed before it reaches
 * the database, so obvious junk never becomes a lookup.
 */
export const API_KEY_PREFIX = 'rk_live_';

/** Bytes of entropy behind the prefix. 32 bytes = 64 hex characters. */
export const API_KEY_ENTROPY_BYTES = 32;
