/**
 * Re-indexes EVERY file in public/data into Pinecone.
 * - JSON knowledge arrays / objects     (crop_diseases.json …)
 * - Any other docs (PDF, MD, TXT…)     → chunk → embed → upsert
 *
 * Requires:
 *   pdf-parse    →  pnpm add pdf-parse
 *   p-retry      →  pnpm add p-retry
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import pRetry from 'p-retry';

import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

/* ── constants ─────────────────────────────────────────────── */
const DATA_DIR   = path.join(process.cwd(), 'public', 'data');
const JSON_FILES = [
  'crop_diseases.json',
  'government_schemes.json',
  'kisan_knowledge_base.json',
];
const BATCH_SIZE = 20;   // <= 20 vectors per embed request → stays under rate-limit
const CHUNK_SZ   = 500;

/* ── helpers ───────────────────────────────────────────────── */

function sanitize(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      (Array.isArray(v) && v.every((x) => typeof x === 'string'))
    ) {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

async function chunkText(text: string) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SZ,
    chunkOverlap: 50,
  });
  return splitter.splitText(text);
}

/* ── main ──────────────────────────────────────────────────── */

(async () => {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index    = pinecone.index(process.env.PINECONE_INDEX!);

  const embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  /* 1️⃣  JSON knowledge arrays / dicts */
  for (const file of JSON_FILES) {
    const raw  = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
    const json = JSON.parse(raw);

    const arr: any[] = Array.isArray(json)
      ? json
      : Object.entries(json).map(([name, obj]) => ({ name, ...(obj as any) }));

    for (let start = 0; start < arr.length; start += BATCH_SIZE) {
      const slice   = arr.slice(start, start + BATCH_SIZE);
      const payload = slice.map((x) => JSON.stringify(x));

      const embeds = await embedder.embedDocuments(payload);
      const vectors = embeds.map((vals, i) => ({
        id: `${file}-${start + i}`,
        values: vals,
        metadata: sanitize({ file, ...slice[i] }),
      }));

      await index.upsert(vectors);
      console.log(`↑ JSON ${file}   ${start}-${start + slice.length - 1}`);
    }
  }

  /* 2️⃣  Other docs in public/data (PDF, MD, TXT, etc.) */
  const all = await fs.readdir(DATA_DIR);
  const others = all.filter((f) => !JSON_FILES.includes(f));

  for (const file of others) {
    const full = path.join(DATA_DIR, file);
    const ext  = path.extname(file).toLowerCase();

    let text = '';
    if (ext === '.pdf') {
      const data = await fs.readFile(full);
      text = (await pdf(data)).text;
    } else {
      text = await fs.readFile(full, 'utf8');
    }

    const chunks = await chunkText(text);
    console.log(`→ ${file} split into ${chunks.length} chunks`);

    for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
      const slice = chunks.slice(start, start + BATCH_SIZE);

      const vectors = await pRetry(
        async () => {
          const embeds = await embedder.embedDocuments(slice);
          return embeds.map((vals, i) => ({
            id: `${file}-${start + i}`,
            values: vals,
            metadata: { file, chunk: start + i },
          }));
        },
        { retries: 5, minTimeout: 2000 }          // backs off on 429
      );

      await index.upsert(vectors);
      console.log(`↑ ${file}  ${start}-${start + slice.length - 1}`);
    }
    console.log(`✔ finished ${file}\n`);
  }

  console.log('✅ KB indexing complete');
})().catch(console.error);