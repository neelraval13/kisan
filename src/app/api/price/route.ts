import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketPrice } from '@/lib/market';

export async function POST(req: NextRequest) {
  const { commodity, state } = await req.json();

  if (!commodity)
    return NextResponse.json(
      { error: 'commodity is required' },
      { status: 400 },
    );

  try {
    const records = await fetchMarketPrice(commodity, state);
    return NextResponse.json({ records });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? 'error' },
      { status: 500 },
    );
  }
}
