# Kisan AI Chatbot

**Agricultural intelligence for every Indian farmer – now open‑source.**

Kisan AI is a full‑stack Next.js application that answers farming questions in
multiple Indian languages, diagnoses crop diseases from photos, quotes
live mandi prices, and remembers each conversation.  It runs locally, or
serverlessly on **Firebase Hosting + Cloud Functions** with Pinecone, Gemini and
Upstash Redis.

---

\## ✨ Features

|  Feature                      |  What it does                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Agricultural Intelligence** | Gemini‑Pro + LangChain RAG answers on crop management, fertiliser schedules, etc.                                     |
| **Crop Disease Detection**    | Upload a photo; the `/api/analyze-image` endpoint classifies & recommends treatment.                                  |
| **Market Price Info**         | Real‑time mandi prices via Agmarknet API, with offline fallback vectors.                                              |
| **Govt Schemes**              | PM‑KISAN, Fasal Bima Yojana, KCC & more – instantly summarised.                                                       |
| **Voice & Images in chat**    | Record voice notes (Web Audio API) or attach photos before sending.                                                   |
| **Multilingual Support**      | Detects Hindi, Marathi, Tamil, Kannada, Telugu, Gujarati, Bengali, Punjabi – auto‑translates via Google Translate v2. |
| **Conversation Memory**       | Last 12 turns + rolling summary stored in Redis for personalised follow‑ups.                                          |
| **Knowledge Base**            | Any PDF/MD/JSON dropped into `public/data` is auto‑chunked → Pinecone vectors.                                        |
| **Firebase Deploy**           | One‑command deploy (`firebase deploy`) – SSR runs in the *nextjs* Cloud Function.                                     |

---

\## 📂 Project Structure

```
├─ public/            ← static assets + data files
│   └─ data/          ← crop_diseases.json, PDFs, etc.
├─ scripts/
│   └─ index_knowledge.ts   ← batch‑index everything into Pinecone
├─ src/
│   ├─ app/
│   │   ├─ page.tsx        ← Chat UI (voice + image bottom bar)
│   │   └─ api/            ← Next App Router API routes
│   ├─ lib/                ← market.ts, retriever.ts, session.ts …
│   └─ types/              ← shared TS types
└─ next.config.ts          ← standalone output for Firebase
```

---

\## 🚀 Local Setup

\### 1. Clone & install

```bash
git clone https://github.com/your‑fork/kisan-chatbot.git
cd kisan-chatbot
pnpm install      # or npm/yarn
```

\### 2. Environment variables (create `.env.local`)

```dotenv
# Google
GEMINI_API_KEY=...
GOOGLE_APPLICATION_CREDENTIALS=./gcp-speech.json

# Pinecone
PINECONE_API_KEY=...
PINECONE_INDEX=kisanai-knowledge
PINECONE_ENVIRONMENT=us-east-1-aws

# Redis (local)  – for prod replace with Upstash URL
REDIS_URL=redis://127.0.0.1:6379

# Agmarknet (optional)
AGMARK_API_KEY=...
```

\### 3. Seed the knowledge base (optional)

Put any docs in `public/data/` and run:

```bash
pnpm dlx tsx scripts/index_knowledge.ts   # embeds & upserts vectors
```

\### 4. Run dev server

```bash
pnpm dev               # http://localhost:3000
```

---

\## ☁️ Deploy to Firebase

1. Install CLI & enable experiment:

```bash
npm i -g firebase-tools
firebase login
firebase experiments:enable webframeworks
```

2. Initialize Hosting **with web framework**:

```bash
firebase init hosting      # choose *Use a web framework* → Next.js
```

3. Store prod secrets:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set PINECONE_API_KEY
firebase functions:secrets:set REDIS_URL   # Upstash rediss:// …
```

4. Deploy:

```bash
firebase deploy --only hosting,functions
```

Live at `https://<project>.web.app`.

---

\## 🛠️ Scripts

| Command                                   | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                                | Next.js dev server with hot‑reload.                      |
| `pnpm build`                              | Production build (standalone for Firebase).              |
| `pnpm dlx tsx scripts/index_knowledge.ts` | Re‑embed & upsert all docs into Pinecone (rate‑limited). |
| `firebase deploy`                         | Upload Hosting + Cloud Functions.                        |

---

\## 🤝 Contributing

1. Fork & create a feature branch.
2. `pnpm lint` (coming soon) and commit with semantic messages.
3. Open a PR – describe the farm workflow you’re improving!

---

\## 📄 License

MIT
