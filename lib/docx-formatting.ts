/**
 * Shared docx formatting utilities for Building Materials reports.
 * Ported from generate-briefing.cjs for use in serverless functions.
 */
import {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ExternalHyperlink,
  ShadingType, VerticalAlign, Document, Packer,
} from "docx";

// Brand colors
export const DARK_BLUE = "1E3A5F";
export const MEDIUM_BLUE = "2B5C8A";
export const LIGHT_GRAY = "F2F2F2";
export const WHITE = "FFFFFF";
export const BLACK = "000000";

export function heading(text: string, level: 1 | 2 | 3) {
  return new Paragraph({
    spacing: { before: level === 1 ? 400 : 300, after: 100 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: level === 1 ? 32 : level === 2 ? 26 : 22,
        color: DARK_BLUE,
        font: "Calibri",
      }),
    ],
  });
}

export function bodyText(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text, size: 22, font: "Calibri" }),
    ],
  });
}

export function articleHeadline(title: string, source: string) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text: title, bold: true, size: 22, font: "Calibri", color: DARK_BLUE }),
      new TextRun({ text: ` (${source})`, italics: true, size: 22, font: "Calibri", color: "666666" }),
    ],
  });
}

export function bulletPoint(text: string) {
  return new Paragraph({
    spacing: { after: 40 },
    bullet: { level: 0 },
    children: [
      new TextRun({ text, size: 22, font: "Calibri" }),
    ],
  });
}

export function sourceLink(url: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: "Source: ", size: 20, font: "Calibri", color: "666666" }),
      new ExternalHyperlink({
        children: [
          new TextRun({ text: url, size: 20, font: "Calibri", color: "0563C1", underline: {} }),
        ],
        link: url,
      }),
    ],
  });
}

export function categoryHeader(text: string) {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    shading: { type: ShadingType.SOLID, color: DARK_BLUE },
    children: [
      new TextRun({ text: `  ${text}`, bold: true, size: 24, font: "Calibri", color: WHITE }),
    ],
  });
}

export function keyDataHeader() {
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    children: [
      new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE }),
    ],
  });
}

export function impactParagraph(text: string) {
  return new Paragraph({
    spacing: { before: 60, after: 40 },
    children: [
      new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }),
      new TextRun({ text, size: 22, font: "Calibri" }),
    ],
  });
}

export function trendRow(driver: string, direction: string, signal: string) {
  const dirColor = direction.includes("Down") || direction.includes("Weakening") ? "008000" :
    direction.includes("Up") || direction.includes("Tightening") ? "CC0000" :
    direction.includes("Expanding") ? "008000" :
    "FF8C00";
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 2800, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: driver, size: 20, font: "Calibri", bold: true })] })],
      }),
      new TableCell({
        width: { size: 1400, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: direction, size: 20, font: "Calibri", bold: true, color: dirColor })] })],
      }),
      new TableCell({
        width: { size: 5400, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: signal, size: 20, font: "Calibri" })] })],
      }),
    ],
  });
}

export function trendTableHeader() {
  return new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 2800, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: DARK_BLUE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: "Driver", bold: true, size: 20, font: "Calibri", color: WHITE })] })],
      }),
      new TableCell({
        width: { size: 1400, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: DARK_BLUE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Direction", bold: true, size: 20, font: "Calibri", color: WHITE })] })],
      }),
      new TableCell({
        width: { size: 5400, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: DARK_BLUE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: "Level / Signal", bold: true, size: 20, font: "Calibri", color: WHITE })] })],
      }),
    ],
  });
}

export function titleBlock(title: string, subtitle: string, dateStr: string) {
  return [
    new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: title, bold: true, size: 36, font: "Calibri", color: DARK_BLUE }),
    ]}),
    new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: subtitle, size: 26, font: "Calibri", color: MEDIUM_BLUE }),
    ]}),
    new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: dateStr, size: 24, font: "Calibri", color: "666666" }),
    ]}),
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { color: DARK_BLUE, space: 1, style: BorderStyle.SINGLE, size: 12 } },
      children: [],
    }),
  ];
}

export function footer() {
  return [
    new Paragraph({ spacing: { before: 400 }, border: { top: { color: DARK_BLUE, space: 1, style: BorderStyle.SINGLE, size: 6 } }, children: [] }),
    new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Compiled by Jarvis AI — Building Materials & Building Products Monitor", italics: true, size: 20, font: "Calibri", color: "666666" }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "This document is part of the Building Materials & Building Products knowledge repository for the semi-annual industry report.", italics: true, size: 18, font: "Calibri", color: "999999" }),
    ]}),
  ];
}

/** Build a complete report document from pre-synthesized content and return buffer */
export async function buildReportDocument(opts: {
  startDate: string;
  endDate: string;
  executiveSummary: string;
  sections: Array<{ category: string; content: string; articles: Array<{ title: string; source: string; analysis: string; dataPoints: string[]; url?: string }> }>;
  drivers: Array<{ driver: string; direction: string; signal: string; content: string; impact: string; dataPoints: string[] }>;
}): Promise<Buffer> {
  const { startDate, endDate, executiveSummary, sections, drivers } = opts;

  const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dateRange = `${formatDate(startDate)} — ${formatDate(endDate)}`;

  const children: any[] = [
    ...titleBlock(
      "BUILDING MATERIALS & BUILDING PRODUCTS",
      "Custom Intelligence Report",
      dateRange,
    ),

    // Executive Summary
    heading("EXECUTIVE SUMMARY", 1),
    ...(executiveSummary || "").split("\n\n").map(p => bodyText(p.trim())).filter(Boolean),

    // Section A: Industry News
    heading("SECTION A: INDUSTRY NEWS", 1),
  ];

  // News categories
  for (const sec of sections) {
    children.push(categoryHeader(sec.category));
    if (sec.content) {
      children.push(bodyText(sec.content));
    }
    for (const art of sec.articles) {
      children.push(articleHeadline(art.title, art.source));
      if (art.analysis) {
        children.push(bodyText(art.analysis));
      }
      if (art.dataPoints?.length) {
        children.push(keyDataHeader());
        for (const dp of art.dataPoints) {
          children.push(bulletPoint(dp));
        }
      }
      if (art.url) {
        children.push(sourceLink(art.url));
      }
    }
  }

  // Section B: Market Health Drivers
  children.push(heading("SECTION B: MARKET HEALTH DRIVERS", 1));

  for (const drv of drivers) {
    children.push(categoryHeader(drv.driver));
    if (drv.content) {
      children.push(bodyText(drv.content));
    }
    if (drv.impact) {
      children.push(impactParagraph(drv.impact));
    }
    if (drv.dataPoints?.length) {
      children.push(keyDataHeader());
      for (const dp of drv.dataPoints) {
        children.push(bulletPoint(dp));
      }
    }
  }

  // Trend Tracker
  if (drivers.length > 0) {
    children.push(heading("TREND TRACKER", 1));
    children.push(new Table({
      width: { size: 9600, type: WidthType.DXA },
      rows: [
        trendTableHeader(),
        ...drivers.map(d => trendRow(d.driver, d.direction, d.signal)),
      ],
    }));
  }

  // Footer
  children.push(...footer());

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } },
      },
      children,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
