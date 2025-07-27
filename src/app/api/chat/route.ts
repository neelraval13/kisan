// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { detectLang, toLang } from '@/lib/i18n';
import { getRetriever } from '@/lib/retriever';
import { fetchMarketPrice, getCommoditySuggestions } from '@/lib/market';
import { findScheme } from '@/lib/schemes';
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

    /* ──────────────  1. Detect user language  ────────────── */
    const userLang = detectLang(message);
    
    // Translate to English for downstream processing
    const msgEn = await toLang(message, 'en');

    /* ──────────────  2. price-query short-circuit  ────────────── */
    const priceMatch = msgEn.match(
      /(?:price|rate|cost)\s+(?:of\s+)?([a-zA-Z\(\)\s]+?)(?:\s+in\s+([a-zA-Z ]+))?$/i,
    );

    if (priceMatch) {
      const [, commodity, state] = priceMatch;
      const cleanCommodity = commodity.trim();
      
      try {
        const rows = await fetchMarketPrice(cleanCommodity, state);

        if (!rows.length) {
          const enReply = `Sorry, no recent mandi price found for **${cleanCommodity}**${state ? ` in **${state}**` : ''} in the last 7 days.\n\n**Currently available:** Arecanut (Betelnut/Supari)\n\n**Try:** "price of arecanut" or "rate of arecanut in kerala"\n\n*Note: The market data API currently has very limited recent data.*`;
          
          return NextResponse.json({
            reply: await toLang(enReply, userLang),
          });
        }

        const fmt = (r: MarketRecord) =>
          `• **${r.arrival_date}** – ${r.market}, ${r.district}, ${r.state}\n  ₹${r.modal_price}/${r.variety || 'Quintal'} (Min: ₹${r.min_price}, Max: ₹${r.max_price})`;

        const enReply =
          `**Latest mandi prices for ${cleanCommodity.toUpperCase()}:**\n\n` +
          rows.map(fmt).join('\n\n') +
          `\n\n*Data from the last 7 days of market records*`;

        return NextResponse.json({ 
          reply: await toLang(enReply, userLang) 
        });
      } catch (error) {
        console.error('Price fetch error:', error);
        const enReply = `Sorry, I couldn't fetch the current market prices. The market data service might be temporarily unavailable.`;
        
        return NextResponse.json({
          reply: await toLang(enReply, userLang),
        });
      }
    }

    /* ──────────────  3. scheme-query short-circuit  ────────────── */
    try {
      const scheme = await findScheme(msgEn);
      if (scheme) {
        const enReply =
          `**${scheme.name}**\n\n` +
          `**Objective:** ${scheme.objective}\n\n` +
          `**Benefits:** ${scheme.benefits}\n\n` +
          `**Eligibility:** ${scheme.eligibility}\n\n` +
          `**How to Apply:** ${scheme.how_to_apply}`;
        
        return NextResponse.json({ 
          reply: await toLang(enReply, userLang) 
        });
      }
    } catch (error) {
      console.error('Scheme fetch error:', error);
      // Continue to normal chat flow if scheme lookup fails
    }

    /* ──────────────  4. normal chat (Gemini)  ────────────── */

    // session bookkeeping (store English for context consistency)
    const hist = sessions.get(userId) ?? [];
    hist.push({ role: 'user', content: msgEn });
    if (hist.length > 12) hist.shift();
    sessions.set(userId, hist);

    // retrieval
    const retriever = await getRetriever();
    const docs = await retriever.getRelevantDocuments(msgEn);
    const context = docs.map((d) => d.pageContent).join('\n\n');

    // Build the system prompt as part of the first user message
    const systemMessage = `${SYSTEM_PROMPT}\n\n### Agricultural Knowledge Context\n${context}\n\nUser: ${msgEn}`;

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
            parts: [{ text: `Context: ${context}\n\nUser: ${msgEn}` }],
          }
        ];

    const res = await ai.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents,
    });

    const enReply =
      res.text?.trim() ??
      `I'm sorry, I could not generate a response.`;

    // Translate response to user's language
    const localizedReply = await toLang(enReply, userLang);

    // Store English response in history for context consistency
    hist.push({ role: 'assistant', content: enReply });
    
    return NextResponse.json({ reply: localizedReply });
  } catch (err) {
    console.error('Chat API Error:', err);
    const enError = 'Failed to generate response';
    
    try {
      // Try to detect language from original message for error translation
      const { message } = await req.json();
      const userLang = detectLang(message);
      const localizedError = await toLang(enError, userLang);
      
      return NextResponse.json(
        { error: localizedError },
        { status: 500 },
      );
    } catch {
      // Fallback to English if translation fails
      return NextResponse.json(
        { error: enError },
        { status: 500 },
      );
    }
  }
}

/* export const runtime = 'edge'; // uncomment if deploying to edge */