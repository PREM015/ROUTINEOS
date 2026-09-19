import { describe, expect, it } from 'vitest';

import { LoginSchema, RegisterSchema } from '../../src/schemas/auth.schema';
import { makeLoginInput, makeRegisterInput } from '../utils/auth';

describe('auth schemas', () => {
  describe('LoginSchema', () => {
    it('accepts a valid email and password', () => {
      expect(LoginSchema.safeParse(makeLoginInput()).success).toBe(true);
    });

    it('rejects a malformed email', () => {
      const result = LoginSchema.safeParse(makeLoginInput({ email: 'not-an-email' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map(issue => issue.path.join('.'))).toContain('email');
      }
    });

    it('rejects a short password', () => {
      const result = LoginSchema.safeParse(makeLoginInput({ password: 'short' }));
      expect(result.success).toBe(false);
    });
  });

  describe('RegisterSchema', () => {
    it('accepts a valid registration payload', () => {
      expect(RegisterSchema.safeParse(makeRegisterInput()).success).toBe(true);
    });

    it('requires a name between 2 and 50 characters', () => {
      expect(RegisterSchema.safeParse(makeRegisterInput({ name: 'A' })).success).toBe(false);
      expect(
        RegisterSchema.safeParse(makeRegisterInput({ name: 'x'.repeat(51) })).success
      ).toBe(false);
      expect(RegisterSchema.safeParse(makeRegisterInput({ name: 'Riri' })).success).toBe(true);
    });

    it('requires an uppercase letter and a digit in the password', () => {
      expect(
        RegisterSchema.safeParse(makeRegisterInput({ password: 'lowercase123' })).success
      ).toBe(false);
      expect(RegisterSchema.safeParse(makeRegisterInput({ password: 'UPPERCASE' })).success).toBe(
        false
      );
    });
  });
});