// src/app/api/models/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function GET() {
  try {
    const modelsPager = await ai.models.list();
    
    // Convert pager to array with only available properties
    const modelsArray = [];
    for await (const model of modelsPager) {
      modelsArray.push({
        name: model.name,
        // Only include properties that exist on the Model type
        ...model, // This will include all available properties
      });
    }
    
    return NextResponse.json({ 
      models: modelsArray,
      count: modelsArray.length
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available models' },
      { status: 500 }
    );
  }
}