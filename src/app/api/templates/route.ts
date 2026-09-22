import { auth } from '@/lib/auth';
import { TemplateRepository } from '@/server/repositories/template.repository';
import { createTemplateSchema, templateQuerySchema } from '@/schemas/template.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Template Route
 * GET  /api/templates – list templates accessible to the user
 * POST /api/templates – create a template
 */

/**
 * GET /api/templates
 * List templates (own + public), optionally filtered by type/category/search.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      type: searchParams.get('type') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      isFeatured: searchParams.get('isFeatured') !== null ? searchParams.get('isFeatured') === 'true' : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = templateQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const templateRepository = new TemplateRepository();
    const templates = await templateRepository.findAll(session.user.id, {
      category: validated.data.category,
      search: validated.data.search,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    return NextResponse.json({
      success: true,
      data: templates,
      meta: {
        total: templates.length,
        limit: validated.data.limit ?? 30,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/templates
 * Create a template owned by the user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const templateRepository = new TemplateRepository();
    const template = await templateRepository.createTemplate(session.user.id, {
      type: validated.data.type,
      name: validated.data.name,
      description: validated.data.description,
      category: validated.data.category,
      isPublic: validated.data.isPublic,
      isFeatured: validated.data.isFeatured,
      content: validated.data.content,
      tags: validated.data.tags,
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}