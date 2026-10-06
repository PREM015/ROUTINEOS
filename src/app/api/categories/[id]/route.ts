import { auth } from '@/lib/auth';
import { categoryService } from '@/server/services/category.service';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const sessionUserId = userIdFromSession(session);

    // Argument order was `(toUserId(id), sessionUserId)`, i.e. the **category**
    // id was passed as the **user** id. `CategoryService.get(userId, categoryId)`
    // resolves to `findById(categoryId, userId)` -> `where: { id: categoryId,
    // userId }`, so the predicate became "category whose id equals the caller's
    // own user id AND whose userId equals the category id" — a condition no row
    // can satisfy. Every DELETE therefore returned 404, including the caller's
    // own categories, so the endpoint was completely non-functional.
    //
    // It was not an IDOR (both columns are cuids, so the mismatched predicate
    // cannot match a foreign row), but `toUserId()` laundered a plain string
    // past the `UserId` brand that exists precisely to catch this mistake.
    const category = await categoryService.get(sessionUserId, id);

    if (!category) {
      return NextResponse.json(notFoundResponse('Category'), { status: 404 });
    }

    await categoryService.delete(sessionUserId, id);

    return NextResponse.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      errorResponse('Failed to delete category'),
      { status: 500 }
    );
  }
}
