import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  /**
   * Optional TOTP code. Declared so the login form can round-trip it through
   * validation, but it must stay optional: a first attempt without a code has
   * to pass schema validation so `authorize` can decide whether 2FA is even
   * enabled on this account.
   */
  totpCode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
});

export const RegisterSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export const loginSchema = LoginSchema;
export const registerSchema = RegisterSchema;
