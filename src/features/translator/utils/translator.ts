/**
 * Translation utility for Sheets Translate
 */

export interface TranslationProgress {
  current: number;
  total: number;
  percentage: number;
}

export type TranslationMode = 'google' | 'gemini';

/**
 * Clean text helper - returns true if the string needs translation
 */
export function needsTranslation(text: any): boolean {
  if (text === null || text === undefined) return false;
  const str = String(text).trim();
  if (str === '') return false;
  
  // Skip numbers, dates, formulas, or purely punctuation strings
  if (/^[-+]?[0-9]*\.?[0-9]+$/.test(str)) return false;
  if (/^[#\-\+\=\*\/\%\!\@\(\)\{\}\[\]\:\;\,\.\?\s]+$/.test(str)) return false;
  
  return true;
}

/**
 * Free Google Translate Single API Call for a single text
 */
async function translateSingleGoogle(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const src = sourceLang === 'auto' ? 'auto' : sourceLang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Translate API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  if (data && data[0]) {
    return data[0].map((x: any) => x[0]).join('');
  }
  return text;
}

/**
 * Free Google Translate Batched API Call
 */
async function translateBatchGoogle(
  texts: string[],
  sourceLang: string,
  targetLang: string
): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    const single = await translateSingleGoogle(texts[0]!, sourceLang, targetLang);
    return [single];
  }

  const separator = '\n___\n';
  const joinedText = texts.join(separator);
  const src = sourceLang === 'auto' ? 'auto' : sourceLang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${targetLang}&dt=t&q=${encodeURIComponent(joinedText)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error();

    const data = await response.json();
    if (data && data[0]) {
      const fullTranslatedText = data[0].map((x: any) => x[0]).join('');
      const parts = fullTranslatedText.split(/___/);
      
      const cleanedParts = parts.map((p: string) => {
        let clean = p.trim();
        clean = clean.replace(/^[\n\r]+|[\n\r]+$/g, '');
        return clean;
      });

      if (cleanedParts.length === texts.length) {
        return cleanedParts;
      }
    }
  } catch (e) {
    // If batched fails, fall back
  }

  // Fallback: translate individual texts in parallel
  const results = await Promise.all(
    texts.map(async (txt) => {
      try {
        return await translateSingleGoogle(txt, sourceLang, targetLang);
      } catch (err) {
        return txt;
      }
    })
  );
  return results;
}

/**
 * Gemini API Translate Batch
 */
async function translateBatchGemini(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  apiKey: string
): Promise<string[]> {
  if (texts.length === 0) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const systemInstruction = `You are a professional spreadsheet translator.
Your task is to translate an array of cell values from "${sourceLang}" to "${targetLang}".
Maintain formatting, capitalization styles, and abbreviations where appropriate.
You MUST respond with a JSON array of strings containing the exact same number of items, in the exact same order.
Example Input: ["Hello", "Unit Price"]
Example Output: ["Xin chào", "Đơn giá"]
Return ONLY the JSON array. Do not include markdown blocks.`;

  const prompt = JSON.stringify(texts);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\nInput Array:\n${prompt}` }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || response.statusText;
    throw new Error(`Gemini API Error: ${message}`);
  }

  const data = await response.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new Error('Gemini API returned an empty response.');
  }

  try {
    const translated = JSON.parse(jsonText.trim());
    if (Array.isArray(translated) && translated.length === texts.length) {
      return translated.map(item => String(item));
    } else {
      throw new Error('Translated array length mismatch or invalid format.');
    }
  } catch (err) {
    console.warn('Gemini batch translation failed parsing, falling back to Google Translate', err);
    return translateBatchGoogle(texts, sourceLang, targetLang);
  }
}

/**
 * Translate list of unique strings
 */
export async function translateTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  mode: TranslationMode,
  apiKey?: string,
  onProgress?: (progress: TranslationProgress) => void,
  checkCancelled?: () => boolean
): Promise<Map<string, string>> {
  const translationMap = new Map<string, string>();
  
  const uniqueTexts = Array.from(new Set(texts)).filter(needsTranslation);
  
  if (uniqueTexts.length === 0) {
    return translationMap;
  }

  const total = uniqueTexts.length;
  let current = 0;
  
  const batchSize = mode === 'gemini' ? 50 : 25;
  
  for (let i = 0; i < uniqueTexts.length; i += batchSize) {
    if (checkCancelled && checkCancelled()) {
      break; // Stop and return whatever translationMap was completed so far
    }

    const batch = uniqueTexts.slice(i, i + batchSize);
    
    let translatedBatch: string[] = [];
    if (mode === 'gemini' && apiKey) {
      try {
        translatedBatch = await translateBatchGemini(batch, sourceLang, targetLang, apiKey);
      } catch (err) {
        console.error('Gemini error, falling back to Google Translate batch:', err);
        translatedBatch = await translateBatchGoogle(batch, sourceLang, targetLang);
      }
    } else {
      translatedBatch = await translateBatchGoogle(batch, sourceLang, targetLang);
    }
    
    batch.forEach((original, index) => {
      const translatedVal = translatedBatch[index] !== undefined ? translatedBatch[index]! : original;
      translationMap.set(original, translatedVal);
    });
    
    current += batch.length;
    if (onProgress) {
      onProgress({
        current,
        total,
        percentage: Math.min(Math.round((current / total) * 100), 100)
      });
    }
    
    if (i + batchSize < uniqueTexts.length) {
      await new Promise(resolve => setTimeout(resolve, mode === 'gemini' ? 500 : 200));
    }
  }
  
  return translationMap;
}
