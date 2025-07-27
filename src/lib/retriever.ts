// src/lib/retriever.ts
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/community/vectorstores/pinecone';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

/** Returns a LangChain retriever (top-k = 3) backed by your Pinecone index */
export async function getRetriever(k = 3) {
  // 1. connect to Pinecone (the SDK auto-detects region from the API key)
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });
  const index = pc.index(process.env.PINECONE_INDEX!);

  // 2. embedder – Gemini’s embeddings endpoint
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  // 3. wrap in a LangChain VectorStore and expose as retriever
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
  });

  return vectorStore.asRetriever({ k });
}
