import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    /* 1️⃣  grab image blob (Next 14 app router supports formData()) */
    const form = await req.formData();
    const file = form.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image' }, { status: 400 });

    /* 2️⃣  convert to base64 (Gemini Vision needs this) */
    const arrayBuf = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString('base64');
    const mime = file.type || 'image/jpeg';

    /* 3️⃣  prompt Gemini-Vision */
    const visionPrompt =
      `You are an expert agronomist and plant pathologist.\n` +
      `Analyze the plant in this image and provide:\n` +
      `• **Disease/Pest Identification**: Name the specific disease, pest, or issue if visible\n` +
      `• **Symptoms Observed**: Describe what you see (leaf spots, discoloration, damage patterns, etc.)\n` +
      `• **Immediate Treatment**: Step-by-step treatment recommendations\n` +
      `• **Prevention Measures**: How to prevent this issue in the future\n` +
      `• **Severity Assessment**: Rate the severity (Mild/Moderate/Severe)\n\n` +
      `If the plant appears healthy, mention that and provide general care tips.`;

    const res = await ai.models.generateContent({
      model: 'models/gemini-1.5-flash', // This model supports vision
      contents: [
        {
          role: 'user',
          parts: [
            { text: visionPrompt },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
    });

    const answer =
      res.text?.trim() ??
      'Sorry, I could not analyze the image.';

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Image Analysis Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze image' },
      { status: 500 }
    );
  }
}

/* export const runtime = 'edge';    // optional on Vercel */