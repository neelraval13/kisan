import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

/** absolute folder where the JSON files now live */
const DATA_DIR = path.join(process.cwd(), 'public', 'data');   //  <- adjust if needed

const FILES = [
  'crop_diseases.json',
  'government_schemes.json',
  // 'market_prices.json',
  'kisan_knowledge_base.json',
];

const BATCH_SIZE = 100;

function sanitize(obj: Record<string, any>) {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      (Array.isArray(v) && v.every((x) => typeof x === 'string'))
    ) {
      clean[k] = v;
    } else {
      clean[k] = JSON.stringify(v);       // or comment this line to skip field
    }
  }
  return clean;
}

async function run() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pc.index(process.env.PINECONE_INDEX!);

  const embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  for (const file of FILES) {
    const filePath = path.join(DATA_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');

    const json = JSON.parse(raw);
    const asArray: any[] = Array.isArray(json)
      ? json
      : Object.entries(json).map(([name, obj]) => ({ name, ...(obj as any) }));

    // ── NEW: slice the array into 100-item chunks ────────────────────────────
    for (let start = 0; start < asArray.length; start += BATCH_SIZE) {
      const slice = asArray.slice(start, start + BATCH_SIZE);

      const vectors = await Promise.all(
        slice.map(async (entry, idx) => ({
          id: `${file}-${start + idx}`,
          values: await embedder.embedQuery(JSON.stringify(entry)),
          metadata: sanitize({ file, ...entry }),       // ← from earlier step
        })),
      );

      await index.upsert(vectors);                      // each call ≤ 100 vecs
      console.log(
        `↑ Indexed ${vectors.length} from ${file} [${start}…${start + vectors.length - 1}]`,
      );
    }
  }
}

run().catch(console.error);