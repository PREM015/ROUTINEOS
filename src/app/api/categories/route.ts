import { auth } from '@/lib/auth';
import { categoryService } from '@/server/services/category.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { ConflictError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Category Route
 * GET  /api/categories - list the authenticated user's categories
 * POST /api/categories - create a category
 *
 * Thin handler: validation, name normalisation and the duplicate-name rule all
 * live in `CategoryService`.
 */

/**
 * GET /api/categories
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    const categories = await categoryService.list(session.user.id);
    return successResponse(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return errorResponse('Failed to fetch categories', 500);
  }
}

/**
 * POST /api/categories
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const category = await categoryService.create(session.user.id, body);

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    if (error instanceof ConflictError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof RangeError) {
      return errorResponse(error.message, 400);
    }
    return errorResponse('Failed to create category', 500);
  }
}
