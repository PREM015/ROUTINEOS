import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuditLog } from '@/server/audit/audit.service';
import { db } from '@/lib/db';
import { AuditAction } from '@/generated/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    
    const filters = {
      userId: searchParams.get('userId') || undefined,
      action: searchParams.get('action') as AuditAction | undefined,
      entityType: searchParams.get('entityType') || undefined,  // ✅ Fixed
      skip: parseInt(searchParams.get('skip') || '0'),
      take: parseInt(searchParams.get('take') || '50'),
    };

    const result = await getAuditLog(filters, db);  // ✅ Fixed call signature
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Audit log error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}