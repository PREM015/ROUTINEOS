import { z } from 'zod';
export const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const RegisterSchema = z.object({ name: z.string().min(2).max(50), email: z.string().email(), password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/) });
