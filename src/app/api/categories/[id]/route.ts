import { auth } from '@/lib/auth';
import { CategoryRepository } from '@/server/repositories/category.repository';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import { NextRequest, NextResponse } from 'next/server';

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

    const categoryRepository = new CategoryRepository();
    const category = await categoryRepository.findById(id, session.user.id);

    if (!category) {
      return NextResponse.json(notFoundResponse('Category'), { status: 404 });
    }

    await categoryRepository.delete(id, session.user.id);

    return NextResponse.json(successResponse({ deleted: true }));
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      errorResponse('Failed to delete category'),
      { status: 500 }
    );
  }
}