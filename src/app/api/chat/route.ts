// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { getRetriever } from '@/lib/retriever';
import { fetchMarketPrice, getCommoditySuggestions } from '@/lib/market';
import { SYSTEM_PROMPT } from '@/lib/prompts';
import type { MarketRecord } from '@/types/market';

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

    /* ──────────────  1. price-query short-circuit  ────────────── */
    const priceMatch =
      message.match(
        /(?:price|rate|cost)\s+(?:of\s+)?([a-zA-Z\(\)\s]+?)(?:\s+in\s+([a-zA-Z ]+))?$/i,
      );

    if (priceMatch) {
      const [, commodity, state] = priceMatch;
      const cleanCommodity = commodity.trim();
      
      try {
        const rows = await fetchMarketPrice(cleanCommodity, state);

        if (!rows.length) {
          return NextResponse.json({
            reply: `Sorry, no recent mandi price found for **${cleanCommodity}**${state ? ` in **${state}**` : ''} in the last 7 days.\n\n**Currently available:** Arecanut (Betelnut/Supari)\n\n**Try:** "price of arecanut" or "rate of arecanut in kerala"\n\n*Note: The market data API currently has very limited recent data.*`,
          });
        }

        const fmt = (r: MarketRecord) =>
          `• **${r.arrival_date}** – ${r.market}, ${r.district}, ${r.state}\n  ₹${r.modal_price}/${r.variety || 'Quintal'} (Min: ₹${r.min_price}, Max: ₹${r.max_price})`;

        const reply =
          `**Latest mandi prices for ${cleanCommodity.toUpperCase()}:**\n\n` +
          rows.map(fmt).join('\n\n') +
          `\n\n*Data from the last 7 days of market records*`;

        return NextResponse.json({ reply });
      } catch (error) {
        console.error('Price fetch error:', error);
        return NextResponse.json({
          reply: `Sorry, I couldn't fetch the current market prices. The market data service might be temporarily unavailable.`,
        });
      }
    }

    /* ──────────────  2. normal chat (Gemini)  ────────────── */

    // session bookkeeping
    const hist = sessions.get(userId) ?? [];
    hist.push({ role: 'user', content: message });
    if (hist.length > 12) hist.shift();
    sessions.set(userId, hist);

    // retrieval
    const retriever = await getRetriever();
    const docs = await retriever.getRelevantDocuments(message);
    const context = docs.map((d) => d.pageContent).join('\n\n');

    // Build the system prompt as part of the first user message
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
          // For subsequent messages, just use the conversation history with context
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
  } catch (err) {
    console.error('Chat API Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 },
    );
  }
}

/* export const runtime = 'edge'; // uncomment if deploying to edge */