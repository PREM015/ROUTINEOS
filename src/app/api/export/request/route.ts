import { auth } from '@/lib/auth';
import { exportUserData, exportToJSON } from '@/server/data/exporter';
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const exportRequestSchema = z.object({
  format: z.enum(['JSON', 'CSV']),
  includeArchived: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = exportRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Create export request
    const exportRecord = await prisma.dataExport.create({
      data: {
        userId: session.user.id,
        format: validated.data.format,
        status: 'PROCESSING',
        includeAttachments: false,
        dateFrom: validated.data.startDate,
        dateTo: validated.data.endDate,
        requestedAt: new Date(),
        startedAt: new Date(),
      },
    });

    // Generate export (in production, this would be a background job)
    try {
      const data = await exportUserData(session.user.id, {
        includeArchived: validated.data.includeArchived,
        startDate: validated.data.startDate,
        endDate: validated.data.endDate,
      });

      const jsonData = exportToJSON(data);
      const fileSize = Buffer.byteLength(jsonData, 'utf8');

      // In production, upload to S3 or similar
      // For now, we'll store the data directly
      const fileUrl = `/api/export/download/${exportRecord.id}`;

      // Update export record
      await prisma.dataExport.update({
        where: { id: exportRecord.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          fileUrl,
          fileSize,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Store export data temporarily (in production, use proper storage)
      // For now, return the data directly
      return NextResponse.json({
        success: true,
        data: {
          exportId: exportRecord.id,
          fileUrl,
          fileSize,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        exportData: data, // Remove this in production
      });
    } catch (error) {
      await prisma.dataExport.update({
        where: { id: exportRecord.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  } catch (error) {
    console.error('Error requesting export:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to request export' },
      { status: 500 }
    );
  }
}