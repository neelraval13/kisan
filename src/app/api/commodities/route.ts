// src/app/api/commodities/route.ts
import { NextResponse } from 'next/server';
import { discoverAvailableCommodities } from '@/lib/market';

export async function GET() {
  try {
    const result = await discoverAvailableCommodities();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching commodities:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}