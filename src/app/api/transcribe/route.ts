import { NextRequest, NextResponse } from 'next/server';
import {
  SpeechClient,
  protos, // 👈 gives us the typed enum
} from '@google-cloud/speech';

const speech = new SpeechClient();

export async function POST(req: NextRequest) {
  /* ---------- grab WebM file from form-data ---------- */
  const form = await req.formData();
  const file = form.get('audio') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const audio = { content: buf.toString('base64') };

  /* ---------- Speech-to-Text config (typed) ---------- */
  const config: protos.google.cloud.speech.v1.IRecognitionConfig = {
    languageCode: 'en-IN',
    enableAutomaticPunctuation: true,
    model: 'latest_short',
    encoding:
      protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding
        .WEBM_OPUS, // ✅ enum, not string
  };

  const [resp] = await speech.recognize({ audio, config });

  const text =
    resp.results?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

  return NextResponse.json({ text });
}

/* export const runtime = 'edge'; // uncomment if deploying to edge */