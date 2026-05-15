/**
 * Structured extraction and source excerpt selection for articles.
 *
 * Two-step process:
 *   1. Structured extraction → article_extractions table (ground truth)
 *   2. Prose summary → articles.content (human-readable)
 *
 * Uses prompt versions from config/prompt-versions.json for auditability.
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

const MODEL_EXTRACTION = process.env.MODEL_EXTRACTION || "claude-haiku-4-5-20251001";
const MODEL_SUMMARY_STANDARD = process.env.MODEL_SUMMARY_STANDARD || "claude-haiku-4-5-20251001";
const MODEL_SUMMARY_EARNINGS = process.env.MODEL_SUMMARY_EARNINGS || "claude-sonnet-4-6";

const PROMPT_VERSION_EXTRACTION = process.env.PROMPT_VERSION_EXTRACTION || "extraction-v1.0";
const PROMPT_VERSION_SUMMARY_STANDARD = process.env.PROMPT_VERSION_SUMMARY_STANDARD || "summary-standard-v1.0";
const PROMPT_VERSION_SUMMARY_EARNINGS = process.env.PROMPT_VERSION_SUMMARY_EARNINGS || "summary-earnings-v1.0";

export interface StructuredExtraction {
  revenue_figure: number | null;
  revenue_period: string | null;
  revenue_currency: string | null;
  ebitda_figure: number | null;
  ebitda_margin_pct: number | null;
  yoy_growth_pct: number | null;
  guidance_verbatim: string | null;
  guidance_direction: string | null;
  guidance_period: string | null;
  mentioned_headwinds: string[] | null;
  mentioned_tailwinds: string[] | null;
  mentioned_capex: string | null;
  mentioned_volume_language: string | null;
  pricing_action: string | null;
  pricing_percentage: number | null;
  additional_metrics: Record<string, any> | null;
  extraction_confidence: number | null;
  fields_present: string[];
  fields_absent: string[];
}

export interface ExtractionResult {
  extraction: StructuredExtraction;
  model_version: string;
  prompt_version: string;
}

export interface SummaryResult {
  summary: string;
  model_version: string;
  prompt_version: string;
}

export interface SourceExcerptResult {
  excerpts: string[];
  model_version: string;
}

// Shared helper for every Anthropic call in this module. Versioned prompts
// dispatched through this fetch (see config/prompt-versions.json):
//   - extraction-v1.0        (used by extractStructuredData)
//   - summary-standard-v1.0  (used by generateSummary, non-earnings)
//   - summary-earnings-v1.0  (used by generateSummary, earnings)
//   - source-excerpt-v1.0    (used by extractSourceExcerpts)
//
// Process-wide failure telemetry. Pre-2026-05 the catch handler here swallowed
// every error silently, which is why article_extractions stayed at 0 rows for
// the system's entire lifetime: every Anthropic call was failing with no
// observable signal. We now write a structured failure code to console.error
// (visible in Vercel function logs) AND keep a small counter the caller can
// read after a run to summarize health.
export interface AnthropicTelemetry {
  totalCalls: number;
  noKey: number;
  http400: number;
  http401: number;
  http429: number;
  http5xx: number;
  fetchError: number;
  parseError: number;
  empty: number;
  ok: number;
  lastError: string | null;
}

export const anthropicTelemetry: AnthropicTelemetry = {
  totalCalls: 0, noKey: 0, http400: 0, http401: 0, http429: 0, http5xx: 0,
  fetchError: 0, parseError: 0, empty: 0, ok: 0, lastError: null,
};

export function resetAnthropicTelemetry(): void {
  Object.assign(anthropicTelemetry, {
    totalCalls: 0, noKey: 0, http400: 0, http401: 0, http429: 0, http5xx: 0,
    fetchError: 0, parseError: 0, empty: 0, ok: 0, lastError: null,
  });
}

/**
 * Parse a JSON object from a model response, tolerating common wrappings.
 *
 * Haiku frequently wraps responses in ```json ... ``` fences or adds a brief
 * preamble despite "no markdown" instructions. Strict JSON.parse on the raw
 * text was failing 100% of the time in 2026-05, leaving article_extractions
 * with 46 rows of zeros. This helper tries three strategies in order:
 *   1. Direct JSON.parse (works when the model complies)
 *   2. Strip markdown code fences if present
 *   3. Slice from first '{' to last '}' as a last-resort recovery
 * Returns null only if all three fail.
 */
export function safeParseJSON(text: string): any | null {
  if (!text) return null;
  // 1. Direct
  try { return JSON.parse(text); } catch {}
  // 2. Markdown fence
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch {}
  }
  // 3. Outer braces
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  return null;
}

/** Same as safeParseJSON but expects an array (for source excerpt extraction). */
export function safeParseJSONArray(text: string): any[] | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : null;
  } catch {}
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) {
    try {
      const v = JSON.parse(fence[1]);
      if (Array.isArray(v)) return v;
    } catch {}
  }
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first !== -1 && last > first) {
    try {
      const v = JSON.parse(text.slice(first, last + 1));
      if (Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

async function callAnthropic(model: string, systemPrompt: string | undefined, userContent: string, maxTokens: number): Promise<string | null> {
  anthropicTelemetry.totalCalls++;
  if (!ANTHROPIC_KEY) {
    anthropicTelemetry.noKey++;
    anthropicTelemetry.lastError = "ANTHROPIC_API_KEY env var is not set";
    console.error("[anthropic] no API key set");
    return null;
  }
  try {
    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userContent }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2024-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 400) anthropicTelemetry.http400++;
      else if (res.status === 401) anthropicTelemetry.http401++;
      else if (res.status === 429) anthropicTelemetry.http429++;
      else if (res.status >= 500) anthropicTelemetry.http5xx++;
      const errText = await res.text().catch(() => "");
      const errMsg = `${res.status}: ${errText.slice(0, 200)}`;
      anthropicTelemetry.lastError = errMsg;
      console.error(`[anthropic] ${errMsg}`);
      return null;
    }
    let data: any;
    try {
      data = await res.json();
    } catch (parseErr: any) {
      anthropicTelemetry.parseError++;
      const msg = `200 OK but JSON parse failed: ${(parseErr?.message || "?").slice(0, 120)}`;
      anthropicTelemetry.lastError = msg;
      console.error(`[anthropic] ${msg}`);
      return null;
    }
    const text = data.content?.[0]?.text;
    if (!text) {
      anthropicTelemetry.empty++;
      anthropicTelemetry.lastError = "200 OK but empty content";
      return null;
    }
    anthropicTelemetry.ok++;
    return text;
  } catch (err: any) {
    anthropicTelemetry.fetchError++;
    const msg = `fetch error: ${(err?.message || "?").slice(0, 200)}`;
    anthropicTelemetry.lastError = msg;
    console.error(`[anthropic] ${msg}`);
    return null;
  }
}

/**
 * Step 1: Structured extraction from article text.
 * Extracts only explicitly stated facts — no inference.
 */
export async function extractStructuredData(articleText: string): Promise<ExtractionResult | null> {
  const systemPrompt = `You are a structured data extraction API. You return only raw JSON objects. You never wrap output in markdown code fences (no \`\`\`json, no \`\`\`). You never include explanatory text before or after the JSON. The very first character of your response is always '{' and the very last is always '}'.`;

  const prompt = `Extract the following from the building materials industry article below. Extract ONLY what is explicitly stated. Do not infer, estimate, or paraphrase. Use null for any field not present.

1. **Financial Figures**: revenue_figure (in millions/billions as stated), revenue_period, revenue_currency, ebitda_figure, ebitda_margin_pct, yoy_growth_pct
2. **Guidance Language**: guidance_verbatim (exact quote from management), guidance_direction (one of: raised, lowered, maintained, initiated, withdrawn), guidance_period
3. **Management Signals**: mentioned_headwinds (array of specific challenges cited), mentioned_tailwinds (array of specific positives cited), mentioned_capex (any capital expenditure plans), mentioned_volume_language (any volume/shipment commentary)
4. **Pricing Signals**: pricing_action (one of: price increase, price decrease, surcharge, neutral), pricing_percentage (if stated)
5. **Confidence**: extraction_confidence (0.0-1.0 based on how explicit the source data was)
6. **Field Tracking**: fields_present (array of field names that had data), fields_absent (array of field names with no data in article)

ARTICLE:
${articleText.slice(0, 6000)}`;

  const text = await callAnthropic(MODEL_EXTRACTION, systemPrompt, prompt, 2500);
  if (!text) return null;

  const parsed = safeParseJSON(text);
  if (!parsed) {
    console.error(`[extraction] JSON parse failed after all strategies. First 300 chars: ${text.slice(0, 300)}`);
    return null;
  }

  try {

    // Ensure fields_present and fields_absent are arrays
    const allFields = [
      "revenue_figure", "revenue_period", "revenue_currency", "ebitda_figure",
      "ebitda_margin_pct", "yoy_growth_pct", "guidance_verbatim", "guidance_direction",
      "guidance_period", "mentioned_headwinds", "mentioned_tailwinds", "mentioned_capex",
      "mentioned_volume_language", "pricing_action", "pricing_percentage",
    ];

    const fieldsPresent = Array.isArray(parsed.fields_present) ? parsed.fields_present : [];
    const fieldsAbsent = Array.isArray(parsed.fields_absent) ? parsed.fields_absent : [];

    // If the model didn't track fields, compute from values
    if (fieldsPresent.length === 0 && fieldsAbsent.length === 0) {
      for (const f of allFields) {
        const val = parsed[f];
        if (val !== null && val !== undefined && (!Array.isArray(val) || val.length > 0)) {
          fieldsPresent.push(f);
        } else {
          fieldsAbsent.push(f);
        }
      }
    }

    return {
      extraction: {
        revenue_figure: parsed.revenue_figure ?? null,
        revenue_period: parsed.revenue_period ?? null,
        revenue_currency: parsed.revenue_currency ?? null,
        ebitda_figure: parsed.ebitda_figure ?? null,
        ebitda_margin_pct: parsed.ebitda_margin_pct ?? null,
        yoy_growth_pct: parsed.yoy_growth_pct ?? null,
        guidance_verbatim: parsed.guidance_verbatim ?? null,
        guidance_direction: parsed.guidance_direction ?? null,
        guidance_period: parsed.guidance_period ?? null,
        mentioned_headwinds: parsed.mentioned_headwinds ?? null,
        mentioned_tailwinds: parsed.mentioned_tailwinds ?? null,
        mentioned_capex: parsed.mentioned_capex ?? null,
        mentioned_volume_language: parsed.mentioned_volume_language ?? null,
        pricing_action: parsed.pricing_action ?? null,
        pricing_percentage: parsed.pricing_percentage ?? null,
        additional_metrics: parsed.additional_metrics ?? null,
        extraction_confidence: parsed.extraction_confidence ?? null,
        fields_present: fieldsPresent,
        fields_absent: fieldsAbsent,
      },
      model_version: MODEL_EXTRACTION,
      prompt_version: PROMPT_VERSION_EXTRACTION,
    };
  } catch {
    return null;
  }
}

/**
 * Step 2: Prose summary, informed by structured extraction.
 * Uses Haiku for general articles, Sonnet for Earnings.
 */
export async function generateSummary(
  title: string,
  articleText: string,
  extraction: StructuredExtraction | null,
  isEarnings: boolean
): Promise<SummaryResult> {
  const model = isEarnings ? MODEL_SUMMARY_EARNINGS : MODEL_SUMMARY_STANDARD;
  const promptVersion = isEarnings ? PROMPT_VERSION_SUMMARY_EARNINGS : PROMPT_VERSION_SUMMARY_STANDARD;
  const wordTarget = isEarnings ? "200-300" : "150-200";

  const extractionContext = extraction
    ? `\n\nEXTRACTED STRUCTURED DATA (ground truth — do not state figures not present here):\n${JSON.stringify(extraction, null, 2)}`
    : "";

  const prompt = isEarnings
    ? `Write a ${wordTarget} word analyst-quality summary of this earnings article for a building materials industry intelligence report. Cover: headline results, guidance changes, management commentary on market conditions, and any segment-level detail.

IMPORTANT: Your summary must not state any figure that is not present in the extracted structured data provided below. Reference the extraction to ensure numerical consistency. Use exact figures from the extraction, not approximations.${extractionContext}

ARTICLE TITLE: ${title}
ARTICLE TEXT:
${articleText.slice(0, 4000)}`
    : `Summarize this building materials industry article in ${wordTarget} words. Preserve all specific numbers, percentages, company names, and dates.

IMPORTANT: Your summary must not state any figure that is not present in the extracted structured data provided below.${extractionContext}

ARTICLE TITLE: ${title}
ARTICLE TEXT:
${articleText.slice(0, 3000)}`;

  const text = await callAnthropic(model, undefined, prompt, isEarnings ? 600 : 400);

  return {
    summary: text || articleText.slice(0, 500),
    model_version: model,
    prompt_version: promptVersion,
  };
}

/**
 * Extract 3-5 verbatim source excerpts from article text.
 * Priority: financial figures > guidance language > executive quotes > topical relevance.
 */
export async function extractSourceExcerpts(articleText: string): Promise<SourceExcerptResult | null> {
  const prompt = `From the article text below, select exactly 3-5 verbatim sentences that are most material to a building materials industry analyst. Prioritize in this order:
1. Sentences containing explicit financial figures (revenue, earnings, margins, growth rates)
2. Sentences containing verbatim guidance language from company management
3. Sentences containing direct quotes from company executives
4. Most topically relevant sentences about market conditions or strategy

Return ONLY a JSON array of the selected sentences, exactly as they appear in the article. Do not paraphrase, truncate, or modify them in any way.

ARTICLE:
${articleText.slice(0, 5000)}`;

  const text = await callAnthropic(MODEL_EXTRACTION, undefined, prompt, 800);
  if (!text) return null;

  const parsed = safeParseJSONArray(text);
  if (!parsed || parsed.length === 0) {
    if (text.length > 0) {
      console.error(`[source-excerpts] JSON array parse failed. First 200 chars: ${text.slice(0, 200)}`);
    }
    return null;
  }
  return { excerpts: parsed.slice(0, 5), model_version: MODEL_EXTRACTION };
}
