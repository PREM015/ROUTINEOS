import { auth } from '@/lib/auth';
import { TemplateRepository } from '@/server/repositories/template.repository';
import { updateTemplateSchema } from '@/schemas/template.schema';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Template by ID Route
 * GET    /api/templates/[id] – fetch a template (own, public, or official)
 * PATCH  /api/templates/[id] – update a user-owned template
 * DELETE /api/templates/[id] – delete a user-owned template
 */

interface RouteContext {
  params: { id: string };
}

function withParsedContent(template: {
  id: string;
  type: string;
  name: string;
  description: string | null;
  category: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  isFeatured: boolean;
  content: string;
  usageCount: number;
  tags: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  let parsedContent: unknown = null;
  try {
    parsedContent = JSON.parse(template.content);
  } catch {
    parsedContent = null;
  }
  return { ...template, parsedContent };
}

/**
 * GET /api/templates/[id]
 * Fetch a single template the user may access.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templateRepository = new TemplateRepository();
    const template = await templateRepository.findById(session.user.id, params.id);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: withParsedContent(template) });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

/**
 * PATCH /api/templates/[id]
 * Update a template owned by the user.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const templateRepository = new TemplateRepository();
    const template = await templateRepository.findById(session.user.id, params.id);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (template.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (Object.keys(validated.data).length === 0) {
      return NextResponse.json({ success: true, data: template });
    }

    const updated = await templateRepository.update(session.user.id, params.id, {
      ...(validated.data.name !== undefined && { name: validated.data.name }),
      ...(validated.data.description !== undefined && { description: validated.data.description }),
      ...(validated.data.category !== undefined && { category: validated.data.category }),
      ...(validated.data.content !== undefined && { content: validated.data.content }),
      ...(validated.data.isPublic !== undefined && { isPublic: validated.data.isPublic }),
      ...(validated.data.isFeatured !== undefined && { isFeatured: validated.data.isFeatured }),
      ...(validated.data.type !== undefined && { type: validated.data.type }),
      ...(validated.data.tags !== undefined && { tags: JSON.stringify(validated.data.tags) }),
    });

    return NextResponse.json({ success: true, data: withParsedContent(updated) });
  } catch (error) {
    console.error('Error updating template:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

/**
 * DELETE /api/templates/[id]
 * Delete a template owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templateRepository = new TemplateRepository();
    const template = await templateRepository.findById(session.user.id, params.id);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (template.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await templateRepository.delete(session.user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}