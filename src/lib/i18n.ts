import { Translate } from '@google-cloud/translate/build/src/v2';
import { franc } from 'franc-min';  // ← Changed from default import to named import

const translate = new Translate();              // auto-auth via env JSON

/** Detect ISO-639-1 code using franc + fallback to 'en' */
export function detectLang(text: string): string {
  const iso6393 = franc(text, { minLength: 5 }); // needs ~5 letters
  if (iso6393 === 'und') return 'en';
  // map common 639-3 → 639-1 for Indian langs
  const map: Record<string, string> = {
    hin: 'hi',
    mar: 'mr',
    tam: 'ta',
    tel: 'te',
    kan: 'kn',
    mal: 'ml',
    guj: 'gu',
    ben: 'bn',
    pan: 'pa',
  };
  return map[iso6393] ?? 'en';
}

/** Translate text to target language (sync v2 API) */
export async function toLang(text: string, target: string): Promise<string> {
  if (target === 'en') return text;
  const [out] = await translate.translate(text, target);
  return Array.isArray(out) ? out[0] : out;
}