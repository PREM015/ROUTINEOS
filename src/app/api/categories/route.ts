import { auth } from '@/lib/auth';
import { CategoryRepository } from '@/server/repositories/category.repository';
import { successResponse, errorResponse, validationErrorResponse } from '@/lib/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * GET /api/categories
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
    }

    const categoryRepository = new CategoryRepository();
    const categories = await categoryRepository.findAll(session.user.id);

    return NextResponse.json(successResponse(categories));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      errorResponse('Failed to fetch categories'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/categories
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
    }

    const body = await request.json();
    const validated = createCategorySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        validationErrorResponse(validated.error.flatten()),
        { status: 400 }
      );
    }

    const categoryRepository = new CategoryRepository();

    // Check for duplicate name
    const existing = await categoryRepository.findByName(
      session.user.id,
      validated.data.name
    );

    if (existing) {
      return NextResponse.json(
        errorResponse('Category with this name already exists'),
        { status: 409 }
      );
    }

    const category = await categoryRepository.create({
      user: { connect: { id: session.user.id } },
      name: validated.data.name,
      nameNormalized: validated.data.name.toLowerCase().replace(/\s+/g, '-'),
      description: validated.data.description,
      color: validated.data.color,
      icon: validated.data.icon,
      sortOrder: validated.data.sortOrder ?? 0,
    });

    return NextResponse.json(successResponse(category), { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      errorResponse('Failed to create category'),
      { status: 500 }
    );
  }
}