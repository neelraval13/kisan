import fs from 'fs/promises';
import path from 'path';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

const KB_DIR = path.join(process.cwd(), 'public', 'data');   // ← HERE

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function loadKbFiles() {
  const files = await fs.readdir(KB_DIR);
  return files.map((f) => ({ file: f, fullPath: path.join(KB_DIR, f) }));
}

export async function chunkText(text: string, size = 500) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: size, chunkOverlap: 50 });
  return splitter.splitText(text);
}

export async function embedAndUpsert(
  docId: string,
  chunks: string[],
  metadata: Record<string, any>,
) {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pc.index(process.env.PINECONE_INDEX!);

  const vectors = await Promise.all(
    chunks.map(async (t, i) => ({
      id: `${docId}-${i}`,
      values: await embeddings.embedQuery(t),
      metadata: { ...metadata, chunk: i, text: t },
    })),
  );
  await index.upsert(vectors);
}
