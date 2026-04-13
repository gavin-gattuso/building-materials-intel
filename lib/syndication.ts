/**
 * Syndication deduplication utilities.
 *
 * Computes a syndication hash from normalized headline + publication date
 * to detect wire stories published across multiple outlets.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "it", "its", "this", "that",
  "these", "those", "not", "no", "nor", "as", "if", "than", "so", "up",
]);

/**
 * Normalize a headline for hashing:
 * - lowercase
 * - strip punctuation
 * - remove stopwords
 * - take first 12 significant words
 */
export function normalizeHeadline(headline: string): string {
  const words = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOPWORDS.has(w));

  return words.slice(0, 12).join(" ");
}

/**
 * Compute SHA-256 syndication hash from normalized headline + date.
 */
export async function computeSyndicationHash(headline: string, date: string): Promise<string> {
  const normalized = normalizeHeadline(headline);
  const input = `${normalized}|${date}`;

  // Use Web Crypto API (available in Node 18+, Bun, and Vercel Functions)
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
