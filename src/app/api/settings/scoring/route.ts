import { NextResponse } from 'next/server';

export async function GET() {
  // Mock response for now
  return NextResponse.json({
    nonNegotiable: 3.0,
    growth: 2.0,
    maintenance: 1.0,
  });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    // Save to db logic here
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update scoring settings' }, { status: 400 });
  }
}
