// src/app/api/test-market/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  if (!process.env.AGMARKNET_API_KEY) {
    return NextResponse.json({ error: 'API key missing' }, { status: 500 });
  }

  const url = new URL('https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070');
  url.searchParams.set('api-key', process.env.AGMARKNET_API_KEY);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '10');

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const data = await res.json();
    
    return NextResponse.json({
      url: url.toString(),
      status: res.status,
      data: data,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}