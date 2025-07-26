// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getRetriever } from '@/lib/retriever';
import { SYSTEM_PROMPT } from '@/lib/prompts';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type Turn = { role: 'user' | 'assistant'; content: string };
const sessions = new Map<string, Turn[]>();

const toHistory = (turns: Turn[]) =>
  turns.map((t) => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.content }],
  }));

export async function POST(req: NextRequest) {
  try {
    const { userId, message } = await req.json();

    const hist = sessions.get(userId) ?? [];
    hist.push({ role: 'user', content: message });
    if (hist.length > 12) hist.shift();
    sessions.set(userId, hist);

    const retriever = await getRetriever();
    const docs = await retriever.getRelevantDocuments(message);
    const context = docs.map((d) => d.pageContent).join('\n\n');

    // Build the system prompt as the first user message
    const systemMessage = `${SYSTEM_PROMPT}\n\n### Agricultural Knowledge Context\n${context}\n\nUser: ${message}`;

    // For the first message, include system prompt
    const contents = hist.length === 1 
      ? [
          {
            role: 'user',
            parts: [{ text: systemMessage }],
          }
        ]
      : [
          // For subsequent messages, just use the conversation history
          ...toHistory(hist.slice(0, -1)), // All but the last message
          {
            role: 'user',
            parts: [{ text: `Context: ${context}\n\nUser: ${message}` }],
          }
        ];

    const res = await ai.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents,
    });

    const reply =
      res.text?.trim() ??
      `I'm sorry, I could not generate a response.`;

    hist.push({ role: 'assistant', content: reply });
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}