// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { detectLang, toLang } from '@/lib/i18n';
import { getRetriever } from '@/lib/retriever';
import { fetchMarketPrice, getCommoditySuggestions } from '@/lib/market';
import { findScheme } from '@/lib/schemes';
import { SYSTEM_PROMPT } from '@/lib/prompts';
import {
  pushTurn,
  getRecent,
  countTurns,
  getSummary,
  setSummary,
  MAX_TURNS,
  SUM_AFTER,
  Turn,
} from '@/lib/session';
import type { MarketRecord } from '@/types/market';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/* ------------------------------------------------------------------ */
/* 1. Auto-summary helper (called when turns > SUM_AFTER)            */
/* ------------------------------------------------------------------ */
async function summariseHistory(uid: string, recent: Turn[]) {
  const prevSummary = (await getSummary(uid)) ?? '';
  const textBlock = recent
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n');

  const summaryPrompt = 
    'Produce a concise summary (<=100 words) of this agricultural chat conversation, ' +
    'focusing on key topics discussed, problems raised, and solutions provided.';

  try {
    const { text } = await ai.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents: [
        { 
          role: 'user', 
          parts: [{ 
            text: `${summaryPrompt}\n\nPrevious summary: ${prevSummary}\n\nRecent conversation:\n${textBlock}` 
          }] 
        }
      ],
    });

    await setSummary(uid, text?.trim() || prevSummary);
  } catch (error) {
    console.error('Summary generation failed:', error);
    // Keep previous summary if generation fails
  }
}

/* ------------------------------------------------------------------ */
/* 2. Helper to check if response is generic/unhelpful               */
/* ------------------------------------------------------------------ */
function isGenericResponse(response: string): boolean {
  if (!response || response.length < 50) return true;
  
  const genericPhrases = [
    'I am unable to find',
    'my current agricultural knowledge context does not contain',
    'consult your local',
    'I don\'t have specific information',
    'please contact',
    'I cannot provide specific',
    'seek advice from',
    'consult with experts',
  ];
  
  return genericPhrases.some(phrase => 
    response.toLowerCase().includes(phrase.toLowerCase())
  );
}

/* ------------------------------------------------------------------ */
/* 3. Main POST /api/chat                                             */
/* ------------------------------------------------------------------ */
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
          
          // Store this interaction in memory
          await pushTurn(userId, { role: 'user', content: msgEn });
          await pushTurn(userId, { role: 'assistant', content: enReply });
          
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

        // Store this interaction in memory
        await pushTurn(userId, { role: 'user', content: msgEn });
        await pushTurn(userId, { role: 'assistant', content: enReply });

        return NextResponse.json({ 
          reply: await toLang(enReply, userLang) 
        });
      } catch (error) {
        console.error('Price fetch error:', error);
        const enReply = `Sorry, I couldn't fetch the current market prices. The market data service might be temporarily unavailable.`;
        
        // Store this interaction in memory
        await pushTurn(userId, { role: 'user', content: msgEn });
        await pushTurn(userId, { role: 'assistant', content: enReply });
        
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
        
        // Store this interaction in memory
        await pushTurn(userId, { role: 'user', content: msgEn });
        await pushTurn(userId, { role: 'assistant', content: enReply });
        
        return NextResponse.json({ 
          reply: await toLang(enReply, userLang) 
        });
      }
    } catch (error) {
      console.error('Scheme fetch error:', error);
      // Continue to normal chat flow if scheme lookup fails
    }

    /* ──────────────  4. normal chat (Gemini first, docs as fallback)  ────────────── */

    // Store user turn in Redis
    await pushTurn(userId, { role: 'user', content: msgEn });

    // Fetch recent conversation history and summary
    const recent = await getRecent(userId, MAX_TURNS);
    const summary = (await getSummary(userId)) ?? '';

    // Convert recent turns to Gemini format
    const toGeminiHistory = (turns: Turn[]) =>
      turns.map((t) => ({
        role: t.role === 'user' ? 'user' : 'model',
        parts: [{ text: t.content }],
      }));

    // Build CLEAN system message for primary call - no mention of knowledge context
    const primarySystemPrompt = `You are an expert agricultural assistant for Indian farmers. 

Provide detailed, practical advice on:
- Crop diseases and treatments
- Pest management  
- Farming techniques
- Agricultural best practices
- Government schemes
- Market information

Use your extensive agricultural knowledge to give specific, actionable solutions. Be confident and helpful.

${summary ? `\n### Conversation Summary\n${summary}` : ''}`;

    const contents = [
      {
        role: 'user',
        parts: [{ text: primarySystemPrompt }],
      },
      ...toGeminiHistory(recent),
    ];

    // First attempt: Query Gemini directly with clean prompt
    let res = await ai.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents,
    });

    let enReply = res.text?.trim() ?? '';

    console.log('=== PRIMARY RESPONSE ===');
    console.log('Length:', enReply.length);
    console.log('Content:', enReply);
    console.log('========================');

    // Check if response is generic/unhelpful
    if (isGenericResponse(enReply)) {
      console.log('Primary response was generic, trying with retrieval context...');
      
      try {
        // NOW use your original SYSTEM_PROMPT with retrieval context
        const retriever = await getRetriever();
        const docs = await retriever.getRelevantDocuments(msgEn);
        const context = docs.map((d) => d.pageContent).join('\n\n');

        if (context.length > 0) {
          console.log(`Retrieved ${docs.length} documents for context`);
          
          // Use your original system prompt WITH context for fallback
          const enhancedSystemBlock =
            `${SYSTEM_PROMPT}\n\n` +
            (summary ? `### Conversation Summary\n${summary}\n\n` : '') +
            `### Agricultural Knowledge Context\n${context}`;

          const enhancedContents = [
            {
              role: 'user',
              parts: [{ text: enhancedSystemBlock }],
            },
            ...toGeminiHistory(recent),
          ];

          // Retry with enhanced context
          const enhancedRes = await ai.models.generateContent({
            model: 'models/gemini-2.5-flash',
            contents: enhancedContents,
          });

          const enhancedReply = enhancedRes.text?.trim();
          
          // Use enhanced response if it's better than the original
          if (enhancedReply && 
              enhancedReply.length > enReply.length && 
              !isGenericResponse(enhancedReply)) {
            enReply = enhancedReply;
            console.log('Used retrieval context for improved response');
          }
        } else {
          console.log('No relevant documents found in retrieval');
        }
      } catch (retrievalError) {
        console.error('Retrieval fallback failed:', retrievalError);
        // Keep the original response if retrieval fails
      }
    }

    // Final fallback if still no good response
    if (!enReply) {
      enReply = `I'm sorry, I could not generate a response. Please try rephrasing your question.`;
    }

    // Store assistant response in Redis
    await pushTurn(userId, { role: 'assistant', content: enReply });

    // Auto-summarise if conversation is getting too long
    if ((await countTurns(userId)) > SUM_AFTER) {
      await summariseHistory(userId, recent);
    }

    // Translate response to user's language
    const localizedReply = await toLang(enReply, userLang);
    
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