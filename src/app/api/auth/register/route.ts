import crypto from 'crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const hashPassword = (password: string) => crypto.createHash('sha256').update(password).digest('hex');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body ?? {};

    if (!name || !email || !password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Name, valid email, and password (6+ chars) are required.' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        role: 'USER',
      },
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/auth/register error:', error);
    return NextResponse.json({ error: 'Registration failed.' }, { status: 500 });
  }
}
