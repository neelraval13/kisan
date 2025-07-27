import fs from 'fs/promises';
import path from 'path';
import type { SchemeDict, SchemeInfo } from '@/types/scheme';

let CACHE: SchemeDict | null = null;

async function load(): Promise<SchemeDict> {
  if (CACHE) return CACHE;
  const fp = path.join(process.cwd(), 'public', 'data', 'government_schemes.json');
  CACHE = JSON.parse(await fs.readFile(fp, 'utf8')) as SchemeDict;
  return CACHE;
}

export async function findScheme(term: string): Promise<SchemeInfo | null> {
  try {
    const dict = await load();
    const q = term.toUpperCase();

    /* 1️⃣ match by key */
    if (dict[q]) return dict[q];

    /* 2️⃣ check if message contains scheme-related keywords */
    const schemeKeywords = [
      'scheme', 'subsidy', 'benefit', 'yojana', 'loan', 'insurance',
      'pradhan mantri', 'pm', 'kisan', 'farmer', 'agriculture', 'crop',
      'government', 'central', 'state', 'ministry', 'department'
    ];
    
    const hasSchemeKeyword = schemeKeywords.some(keyword => 
      q.includes(keyword.toUpperCase())
    );

    if (!hasSchemeKeyword) return null;

    /* 3️⃣ substring match in scheme names - with safety checks */
    const schemes = Object.values(dict).filter(s => s && s.name);
    
    // First try exact word matches
    let match = schemes.find(s => {
      const schemeName = s.name.toUpperCase();
      const words = q.split(/\s+/);
      return words.some(word => 
        word.length > 2 && schemeName.includes(word)
      );
    });

    // If no exact word match, try broader substring matching
    if (!match) {
      match = schemes.find(s => {
        const schemeName = s.name.toUpperCase();
        return schemeName.includes(q) || q.includes(schemeName);
      });
    }

    return match ?? null;
  } catch (error) {
    console.error('Error in findScheme:', error);
    return null;
  }
}