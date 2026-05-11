/**
 * Quick smoke test for the Google News URL decoder.
 *
 * Run with: `npx bun scripts/test-google-news-decoder.ts`
 *
 * Pulls 5 real news.google.com URLs from the articles table and runs the
 * decoder against each. Reports success/failure plus which method won.
 */

import { createClient } from "@supabase/supabase-js";
import { decodeGoogleNewsUrl } from "../lib/google-news-decoder.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

// Hardcoded fallback URLs (from production DB) in case Supabase auth is
// unavailable in the local environment running this script.
const FALLBACK_URLS = [
  "https://news.google.com/rss/articles/CBMiuAFBVV95cUxNTGxwc2Zlb1A1RHFZaHhjb1p6Wm94UUdmRllMX2NBVG1XTWx2Rl9PamRtb3lCV2YwQVlYSnZMb0RNTDRTZzN4WWREc2p1UU4tWVNxZ2t3b3Z2UWRoNEoxRVFCWEhjR3FVWmFVVW5pNGtjd21QS1Uta1VrR0xKS21UYlFQYTZ1US1UN2tyTk9TdkhHMGdfcG1EZjRXWGZJQ2duTjVaZTJJLUFyaDdibzRpa0YzSzM1dDJH?oc=5",
  "https://news.google.com/rss/articles/CBMinAFBVV95cUxPTGY4TkVVWXctX09mU21KYXY1SGVUUnJ6QTMtSmtNX0M2WC05ekNYZlN1YUZ3NjBRY0pzaVgzMUxUTVhjb1FMS0dCd0dKOXE4WGRnbTRHMFJJblZkWWxJbXVpaXhXMHg2NE9hN0U3ZHpYSjdiVk12NWNZaERQXzFMRm5VX0hmZUpNUTV6ZUpIMGpwelpsdVZlZWo3UGc?oc=5",
  "https://news.google.com/rss/articles/CBMihwFBVV95cUxPYmJnR3ZLNTFvVXpuOTJTODVzSXc0d3VBejd3bzBFT3ZIU3VZWDQ4ajdSa2ZtZGJES21lSEFhb0ktak1SZ3VXMi1yalVqLVNvMmJRTzJ6M29ZOUF0d3FxREpBNVFaVVFDLUdPV2UwbzVJRWhSYmxQU21Hd0Q4cFNFemtROVU3d28?oc=5",
  "https://news.google.com/rss/articles/CBMinAFBVV95cUxPTTl4U2czVUNDTzYzOWtHaWlDMmx6Vy1yYW5OX1N2b0ZvVmY4ZzFXOVFLNjVuN3UzWk41cWx3UGhJdDFBb09iMFp3bWl4ai0xbzM3NE9hQU1HMm9JMF82WHNnYzF5UVZVMXQxNGZld0dXODRkQ2Q2dnFHd2ZfRDhZcUE2US1KSEEyNU9FcHhqZnZENkd3cnI3QnhHeEE?oc=5",
  "https://news.google.com/rss/articles/CBMiqAFBVV95cUxObmEzMmt5NVhCamdCX3ZudWpkTnFZMXA2Z0VkcWY5cFlDOWF2dmZZS19JRzAwbkpUSFdDTkxWb20yMERpR3VoMWRDbzdGOVd0YjBNYzJvX3FadnFjRHlqTXhnVHpOV0VzcUxjdTFlQWlPcTlFVkZKaDFtbUF6RF9LcmFxZTN3WDFfTTNuWVJtUnREeEtkcGExbjIySGJjbTRtdWxfd0pGRlM?oc=5",
];

async function getSampleUrls(): Promise<string[]> {
  if (!SUPABASE_KEY) {
    console.log("(No SUPABASE_*_KEY in env — using hardcoded sample URLs.)\n");
    return FALLBACK_URLS;
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase
      .from("articles")
      .select("url")
      .like("url", "https://news.google.com/%")
      .limit(5);
    if (error || !data || data.length === 0) {
      console.log(`(Supabase fetch failed: ${error?.message || "no rows"} — using hardcoded URLs.)\n`);
      return FALLBACK_URLS;
    }
    return data.map(r => r.url as string);
  } catch (err: any) {
    console.log(`(Supabase error: ${err.message} — using hardcoded URLs.)\n`);
    return FALLBACK_URLS;
  }
}

async function main() {
  const urls = await getSampleUrls();
  console.log(`Testing ${urls.length} Google News URLs.\n`);

  const counts: Record<string, number> = { base64: 0, batchexecute: 0, "redirect-follow": 0, failed: 0 };
  const results: Array<{ idx: number; method: string; ok: boolean; out: string; durMs: number }> = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const t0 = Date.now();
    const result = await decodeGoogleNewsUrl(url);
    const dur = Date.now() - t0;
    const ok = result.method !== "failed";
    counts[result.method] = (counts[result.method] || 0) + 1;
    results.push({ idx: i + 1, method: result.method, ok, out: result.url, durMs: dur });

    console.log(`[${i + 1}/${urls.length}] ${ok ? "OK " : "FAIL"} method=${result.method} time=${dur}ms`);
    console.log(`        in:  ${url.slice(0, 110)}...`);
    console.log(`        out: ${result.url.slice(0, 160)}\n`);
  }

  const success = results.filter(r => r.ok).length;
  console.log("─".repeat(60));
  console.log(`Summary: ${success}/${urls.length} succeeded`);
  console.log(`  base64:          ${counts.base64}`);
  console.log(`  batchexecute:    ${counts.batchexecute}`);
  console.log(`  redirect-follow: ${counts["redirect-follow"]}`);
  console.log(`  failed:          ${counts.failed}`);
}

main().catch(err => {
  console.error("Test crashed:", err);
  process.exit(1);
});
