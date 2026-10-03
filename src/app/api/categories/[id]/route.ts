import { auth } from '@/lib/auth';
import { categoryService } from '@/server/services/category.service';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DELETE /api/categories/[id]
 *
 * The route already used the shared response helpers, so the response shape is
 * unchanged; only the data access moved behind `CategoryService`, which also
 * applies the ownership check (`findById` is scoped by `userId`).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
    }

    const category = await categoryService.get(id, session.user.id);

    if (!category) {
      return NextResponse.json(notFoundResponse('Category'), { status: 404 });
    }

    await categoryService.delete(id, session.user.id);

    return NextResponse.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      errorResponse('Failed to delete category'),
      { status: 500 }
    );
  }
}
