import { TemplateRepository } from '@/server/repositories/template.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Public Templates Route
 * GET /api/templates/public – list public templates (no auth required)
 */

/**
 * GET /api/templates/public
 * List public templates sorted by usage.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 30;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'limit must be an integer between 1 and 100' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return NextResponse.json({ error: 'offset must be a non-negative integer' }, { status: 400 });
    }

    const templateRepository = new TemplateRepository();
    const templates = await templateRepository.listPublic(limit, offset);

    return NextResponse.json({
      success: true,
      data: templates,
      meta: {
        total: templates.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching public templates:', error);
    return NextResponse.json({ error: 'Failed to fetch public templates' }, { status: 500 });
  }
}