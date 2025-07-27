import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export type Turn = { role: 'user' | 'assistant'; content: string };
const MAX_TURNS   = 12;   // how many raw turns we pass to Gemini
const SUM_AFTER   = 50;   // summarise when chat > 50 turns

export async function pushTurn(uid: string, turn: Turn) {
  await redis.rpush(`chat:${uid}:log`, JSON.stringify(turn));
}

export async function getRecent(uid: string, n = MAX_TURNS): Promise<Turn[]> {
  const raw = await redis.lrange(`chat:${uid}:log`, -n, -1);
  return raw.map((s) => JSON.parse(s) as Turn);
}

export async function countTurns(uid: string) {
  return redis.llen(`chat:${uid}:log`);
}

export async function getSummary(uid: string) {
  return redis.get(`chat:${uid}:summary`);
}

export async function setSummary(uid: string, text: string) {
  await redis.set(`chat:${uid}:summary`, text);
}

/** Clear the whole session (optional admin helper) */
export async function resetSession(uid: string) {
  await redis.del(`chat:${uid}:log`, `chat:${uid}:summary`);
}

export { MAX_TURNS, SUM_AFTER };
