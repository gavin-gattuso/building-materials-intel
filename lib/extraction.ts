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

async function callAnthropic(model: string, systemPrompt: string | undefined, userContent: string, maxTokens: number): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
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
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

/**
 * Step 1: Structured extraction from article text.
 * Extracts only explicitly stated facts — no inference.
 */
export async function extractStructuredData(articleText: string): Promise<ExtractionResult | null> {
  const prompt = `You are a structured data extraction system for building materials industry articles. Extract ONLY what is explicitly stated in the article. Do not infer, estimate, or paraphrase guidance language. If a figure or statement is not present in the article, return null for that field.

Extract the following from the article text below:

1. **Financial Figures**: revenue_figure (in millions/billions as stated), revenue_period, revenue_currency, ebitda_figure, ebitda_margin_pct, yoy_growth_pct
2. **Guidance Language**: guidance_verbatim (exact quote from management), guidance_direction (one of: raised, lowered, maintained, initiated, withdrawn), guidance_period
3. **Management Signals**: mentioned_headwinds (array of specific challenges cited), mentioned_tailwinds (array of specific positives cited), mentioned_capex (any capital expenditure plans), mentioned_volume_language (any volume/shipment commentary)
4. **Pricing Signals**: pricing_action (one of: price increase, price decrease, surcharge, neutral), pricing_percentage (if stated)
5. **Confidence**: extraction_confidence (0.0-1.0 based on how explicit the source data was)
6. **Field Tracking**: fields_present (array of field names that had data), fields_absent (array of field names with no data in article)

Respond with JSON only, no preamble or markdown fences. Every field must be present in the response; use null for absent data.

ARTICLE:
${articleText.slice(0, 6000)}`;

  const text = await callAnthropic(MODEL_EXTRACTION, undefined, prompt, 1500);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);

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

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { excerpts: parsed.slice(0, 5), model_version: MODEL_EXTRACTION };
    }
    return null;
  } catch {
    return null;
  }
}
