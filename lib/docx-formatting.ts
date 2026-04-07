/**
 * Shared docx formatting utilities for Building Materials reports.
 * Styled to match the Applied Value YTD 2025 Building Materials & Products Report.
 */
import {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ExternalHyperlink,
  ShadingType, VerticalAlign, Document, Packer, Header, Footer,
  PageNumber, NumberFormat,
} from "docx";

// Applied Value brand colors (from YTD2025 PDF)
export const DARK_GREEN = "163E2D";    // table headers, primary accent
export const MEDIUM_GREEN = "328D66";  // driver name cells
export const ACCENT_GREEN = "215D44";  // subheading text, lines
export const LIGHT_GRAY = "E5E5E5";
export const WHITE = "FFFFFF";
export const BLACK = "000000";
export const GRAY_TEXT = "7B7B7B";

// Trend indicator colors
export const POSITIVE_GREEN = "00B050";
export const NEUTRAL_AMBER = "FFC000";
export const NEGATIVE_RED = "FF0000";

const FONT = "Arial";
const FONT_BOLD = "Arial";

export function heading(text: string, level: 1 | 2 | 3) {
  if (level === 1) {
    // Major section heading: ArialNova-Bold 18pt black
    return new Paragraph({
      spacing: { before: 400, after: 160 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 36, // 18pt
          font: FONT,
          color: BLACK,
        }),
      ],
    });
  }
  if (level === 2) {
    // Subsection heading: Arial-Bold 14pt dark green
    return new Paragraph({
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 28, // 14pt
          font: FONT,
          color: ACCENT_GREEN,
        }),
      ],
    });
  }
  // Level 3: smaller subheading
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24, // 12pt
        font: FONT,
        color: ACCENT_GREEN,
      }),
    ],
  });
}

export function bodyText(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text, size: 24, font: FONT }), // 12pt
    ],
  });
}

export function articleHeadline(title: string, source: string) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text: title, bold: true, size: 24, font: FONT, color: DARK_GREEN }),
      new TextRun({ text: ` (${source})`, italics: true, size: 24, font: FONT, color: GRAY_TEXT }),
    ],
  });
}

export function bulletPoint(text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    bullet: { level: 0 },
    children: [
      new TextRun({ text, size: 24, font: FONT }),
    ],
  });
}

export function sourceLink(url: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: "Source: ", size: 20, font: FONT, color: GRAY_TEXT }),
      new ExternalHyperlink({
        children: [
          new TextRun({ text: url, size: 20, font: FONT, color: "0563C1", underline: {} }),
        ],
        link: url,
      }),
    ],
  });
}

export function categoryHeader(text: string) {
  return new Paragraph({
    spacing: { before: 300, after: 120 },
    shading: { type: ShadingType.SOLID, color: DARK_GREEN },
    children: [
      new TextRun({ text: `  ${text}`, bold: true, size: 24, font: FONT, color: WHITE }),
    ],
  });
}

export function keyDataHeader() {
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    children: [
      new TextRun({ text: "Key Data Points:", bold: true, size: 24, font: FONT, color: ACCENT_GREEN }),
    ],
  });
}

export function impactParagraph(label: string, text: string) {
  return new Paragraph({
    spacing: { before: 80, after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, italics: true, size: 24, font: FONT, color: ACCENT_GREEN }),
      new TextRun({ text, size: 24, font: FONT }),
    ],
  });
}

/** Color for trend direction matching the PDF style */
function trendColor(direction: string): string {
  const d = direction.toLowerCase();
  if (d.includes("positive") || d.includes("expanding") || d.includes("improving")) return POSITIVE_GREEN;
  if (d.includes("neutral") || d.includes("mixed") || d.includes("stable")) return NEUTRAL_AMBER;
  return NEGATIVE_RED; // negative, weakening, tightening, etc.
}

/** Background tint for trend cells */
function trendCellBg(direction: string): string {
  const d = direction.toLowerCase();
  if (d.includes("positive") || d.includes("expanding") || d.includes("improving")) return "E0F4EB";
  if (d.includes("neutral") || d.includes("mixed") || d.includes("stable")) return "FFF3E0";
  return "F9C3C9";
}

export function trendRow(driver: string, summary: string, direction: string) {
  return new TableRow({
    children: [
      // Driver name - medium green background, white bold text
      new TableCell({
        width: { size: 2200, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: MEDIUM_GREEN },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [
          new TextRun({ text: driver.toUpperCase(), size: 22, font: FONT, bold: true, color: WHITE }),
        ] })],
      }),
      // Summary
      new TableCell({
        width: { size: 4600, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [
          new TextRun({ text: summary, size: 22, font: FONT }),
        ] })],
      }),
      // Recent Trend - color-coded
      new TableCell({
        width: { size: 1600, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: trendCellBg(direction) },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 }, children: [
          new TextRun({ text: direction, size: 22, font: FONT, bold: true, color: trendColor(direction) }),
        ] })],
      }),
    ],
  });
}

export function trendTableHeader() {
  const cell = (text: string, width: number) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, color: DARK_GREEN },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 }, children: [
      new TextRun({ text, bold: true, size: 24, font: FONT, color: WHITE }),
    ] })],
  });

  return new TableRow({
    tableHeader: true,
    children: [
      cell("DRIVER", 2200),
      cell("SUMMARY", 4600),
      cell("RECENT TREND", 1600),
    ],
  });
}

export function titleBlock(title: string, subtitle: string, dateStr: string) {
  return [
    // Green accent line at top
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { color: ACCENT_GREEN, space: 1, style: BorderStyle.SINGLE, size: 18 } },
      children: [],
    }),
    // Company info
    new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.LEFT, children: [
      new TextRun({ text: "Applied Value", bold: true, size: 20, font: FONT, color: GRAY_TEXT }),
    ]}),
    new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.LEFT, children: [
      new TextRun({ text: "One Biscayne Tower  |  2 S Biscayne Blvd. Suite 1750  |  Miami, FL 33131", size: 20, font: FONT, color: GRAY_TEXT }),
    ]}),
    new Paragraph({ spacing: { after: 300 }, alignment: AlignmentType.LEFT, children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: "www.appliedvaluegroup.com", bold: true, size: 20, font: FONT, color: GRAY_TEXT })],
        link: "https://www.appliedvaluegroup.com",
      }),
    ]}),
    // Title on green background
    new Paragraph({
      spacing: { before: 100, after: 0 },
      shading: { type: ShadingType.SOLID, color: ACCENT_GREEN },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "  ", size: 12 }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      shading: { type: ShadingType.SOLID, color: ACCENT_GREEN },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: title, bold: true, size: 40, font: FONT, color: WHITE }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      shading: { type: ShadingType.SOLID, color: ACCENT_GREEN },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: subtitle, size: 28, font: FONT, color: WHITE }),
      ],
    }),
    new Paragraph({
      spacing: { before: 100, after: 0 },
      shading: { type: ShadingType.SOLID, color: ACCENT_GREEN },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: dateStr, size: 24, font: FONT, color: WHITE }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 200 },
      shading: { type: ShadingType.SOLID, color: ACCENT_GREEN },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "  ", size: 12 }),
      ],
    }),
    // Divider after title block
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { color: ACCENT_GREEN, space: 1, style: BorderStyle.SINGLE, size: 12 } },
      children: [],
    }),
  ];
}

export function footer() {
  return [
    new Paragraph({ spacing: { before: 400 }, border: { top: { color: ACCENT_GREEN, space: 1, style: BorderStyle.SINGLE, size: 6 } }, children: [] }),
    new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Compiled by Jarvis AI — Building Materials & Building Products Monitor", italics: true, size: 20, font: FONT, color: GRAY_TEXT }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Applied Value  |  www.appliedvaluegroup.com", italics: true, size: 18, font: FONT, color: GRAY_TEXT }),
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
    heading("Executive Summary", 1),
    ...(executiveSummary || "").split("\n\n").map(p => bodyText(p.trim())).filter(Boolean),
  ];

  // Drivers of Market Health — summary table first (matching PDF layout)
  if (drivers.length > 0) {
    children.push(heading("Drivers of Market Health", 1));
    children.push(new Table({
      width: { size: 8400, type: WidthType.DXA },
      rows: [
        trendTableHeader(),
        ...drivers.map(d => trendRow(d.driver, d.signal, d.direction)),
      ],
    }));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

    // Individual driver deep-dives
    children.push(heading("Recent Trends & Outlook", 2));
    for (const drv of drivers) {
      children.push(heading(drv.driver, 2));
      if (drv.content) {
        children.push(bodyText(drv.content));
      }
      if (drv.impact) {
        children.push(impactParagraph("Impact on Construction", drv.impact));
      }
      if (drv.dataPoints?.length) {
        children.push(keyDataHeader());
        for (const dp of drv.dataPoints) {
          children.push(bulletPoint(dp));
        }
      }
    }
  }

  // Industry News
  if (sections.length > 0) {
    children.push(heading("Industry News", 1));
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
  }

  // Footer
  children.push(...footer());

  // Page header (matching PDF: page number + report title)
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({ text: "Applied Value — Building Materials & Products Market Health Report", size: 16, font: FONT, color: GRAY_TEXT }),
        ],
      }),
    ],
  });

  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: GRAY_TEXT }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
          pageNumbers: { start: 1 },
        },
      },
      headers: { default: pageHeader },
      footers: { default: pageFooter },
      children,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
