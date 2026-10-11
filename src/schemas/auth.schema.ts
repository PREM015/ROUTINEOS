import { z } from 'zod';

const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  /**
   * Optional TOTP code. Declared so the login form can round-trip it through
   * validation, but it must stay optional: a first attempt without a code has
   * to pass schema validation so `authorize` can decide whether 2FA is even
   * enabled on this account.
   */
  totpCode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  remember: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  name: z.string().min(2).max(50),
  email: emailSchema,
  password: passwordSchema,
  timezone: z.string().optional(),
});

export const loginSchema = LoginSchema;
export const registerSchema = RegisterSchema;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export const setupTwoFactorSchema = z.object({
  password: z.string().min(1, 'Password is required to enable two-factor authentication'),
});

export const verifyTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit code'),
  trustDevice: z.boolean().optional(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const accountDeletionSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  reason: z.string().max(2000).optional(),
  confirmation: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm account deletion' }),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SetupTwoFactorInput = z.infer<typeof setupTwoFactorSchema>;
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type AccountDeletionInput = z.infer<typeof accountDeletionSchema>;