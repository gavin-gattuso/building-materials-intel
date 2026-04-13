# Applied Value — Building Materials Report
# PIXEL-VERIFIED FORMATTING SPECIFICATION
# Measured from 300 DPI rasterization of source PDF

---

## QUICK REFERENCE: VERIFIED EXACT VALUES

| Property | Value | Source |
|---|---|---|
| Page size | 8.5 × 11.0 in (Letter) | PDF metadata |
| Left margin | **23.66pt (0.329in)** | Pixel measured |
| Right margin | **23.66pt (0.329in)** | Pixel measured |
| Text width | **566.58pt (7.869in)** | Pixel measured |
| Body line spacing | **14.04pt** | Pixel measured |
| AV dark green (table headers, rules) | **#163e2d** | Sampled px |
| AV cover green (box band, back cover) | **#215d44** | Sampled px |
| Negative trend cell | **#fc595c** | Sampled px |
| Positive trend cell | **#00b050** | Sampled px |
| Distribution orange | **#ffa347** | Sampled px |
| Residential teal | **#2cafea** | Sampled px |
| Delta bubble salmon | **#e8b6bb** | Sampled px |
| Delta bubble green | **#d7eae1** | Sampled px |
| Chart teal series | **#1ba9e9** | Sampled px |
| Chart steel gray bar | **#b5b5b5** | Sampled px |
| TOC bullet green | **#2c654d** | Sampled px |

---

## PART 1: DOCUMENT SETUP

### Page Dimensions
- **Size:** US Letter, 8.5 × 11.0 inches (612 × 792 pt)
- **Orientation:** Portrait only
- **Bleed:** None

### Margins (pixel-verified)
```
Top:    varies by page type (see per-page specs)
Left:   23.66pt  (0.329in)
Right:  23.66pt  (0.329in)
Bottom: ~36pt    (0.5in, includes footer logo space)
Text width (left edge to right edge): 566.58pt (7.869in)
```

---

## PART 2: COLOR PALETTE (ALL VALUES PIXEL-SAMPLED)

```
PRIMARY BRAND COLORS:
  AV Dark Green         #163e2d   rgb(22,62,45)    — table headers, running rules, section underlines
  AV Cover Green        #215d44   rgb(33,93,68)    — cover box band, back cover bg, some logo variants
  AV Medium Green       #2c654d   rgb(44,101,77)   — bullet points (›), TOC bullets
  AV Subheading Green   #215d44   rgb(33,93,68)    — green bold subheadings in body text

STATUS/TREND COLORS:
  Positive Green        #00b050   rgb(0,176,80)    — "Positive" text and cell background
  Negative Red          #fc595c   rgb(252,89,92)   — "Negative" text and cell background
  Neutral Orange        #ffa347   rgb(255,163,71)  — "Neutral" text + Distribution segment color

SEGMENT COLORS (company table):
  Nonresidential Fwd    #163e2d   rgb(22,62,45)    — dark green (same as primary)
  Distribution          #ffa347   rgb(255,163,71)  — orange
  Residential Fwd       #2cafea   rgb(44,175,234)  — sky blue

CHART / DATA COLORS:
  Chart Black           #1a1a1a   rgb(26,26,26)    — primary series (Total spend, etc.)
  Chart Green           #215d44   rgb(33,93,68)    — second series
  Chart Teal            #1ba9e9   rgb(27,169,233)  — third series (30-yr mortgage, etc.)
  Chart Orange          #e8833a   rgb(232,131,58)  — S&P 500 / accent series
  Steel Gray Bar        #b5b5b5   rgb(181,181,181) — steel subsector bars
  Average Marker Gray   #8f8f8f   rgb(143,143,143) — Ø average triangle

DELTA BUBBLE COLORS:
  Positive bubble fill  #d7eae1   rgb(215,234,225) — light green
  Negative bubble fill  #e8b6bb   rgb(232,182,187) — salmon/blush

TEXT COLORS:
  Body text black       #1a1a1a   rgb(26,26,26)
  Running header gray   #5a5a5a   rgb(90,90,90)    — approx (anti-aliased)
  Figure caption gray   #5a5a5a   rgb(90,90,90)
  Source line gray      #6e6e6e   rgb(110,110,110)
  White                 #ffffff   — on dark backgrounds

BACKGROUND COLORS:
  Page bg               #ffffff
  Callout box bg        #f2f2f2   rgb(242,242,242)
  Table alt row         #ffffff   (no true alternating fill — white throughout)
  Table row border      #d0d0d0   rgb(208,208,208)
```

---

## PART 3: TYPOGRAPHY

### Font Stack
The original PDF uses what renders as a **sans-serif** for body text and a **bold sans-serif** for headers. The closest match is:
- **Primary font:** `Calibri` (Windows) or `Helvetica Neue` / `Arial` (cross-platform)
- All text is sans-serif throughout — this is NOT a serif report

### Font Size Reference (measured from 300 DPI render)

| Element | Font Size | Weight | Color | Notes |
|---|---|---|---|---|
| Section title (e.g. "Introduction") | **16–18pt** | Bold | #1a1a1a | Visually ~16pt based on 11.7pt cap height / 0.7 |
| Green subheadings | **10–11pt** | Bold | #215d44 | "Performance & Outlook..." |
| Body paragraph text | **9–10pt** | Regular | #1a1a1a | 14pt line spacing measured |
| Bold inline labels | **9–10pt** | Bold | #1a1a1a | "Impact on Construction:" |
| Bullet text | **9–10pt** | Regular | #1a1a1a | Same as body |
| Running header text | **7.5–8pt** | Regular | #5a5a5a | Gray, left-aligned |
| Page number | **8pt** | Regular | #5a5a5a | Top right |
| Table header text | **8–9pt** | Bold | #ffffff | Uppercase column labels |
| Table body text | **8–8.5pt** | Regular | #1a1a1a | |
| Figure caption | **8pt** | Italic | #5a5a5a | Above chart: "Figure N: ..." |
| Source line | **7–7.5pt** | Regular | #6e6e6e | Below chart: "Source: Capital IQ, ..." |
| Footnote | **7pt** | Regular | #6e6e6e | Superscript refs |
| Chart axis labels | **7.5pt** | Regular | #5a5a5a | |
| Chart legend text | **8pt** | Regular | #1a1a1a | |
| Cover title (large) | **20–22pt** | Bold | #ffffff | On dark green overlay box |
| Cover date line | **11–12pt** | Regular | #ffffff | "2025 YTD" + "November 2025" |
| TOC title | **20–22pt** | Bold | #1a1a1a | Same weight as section titles |
| TOC "(2025 YTD)" subtitle | **14–16pt** | Bold | #1a1a1a | |
| TOC item text | **10pt** | Regular | #1a1a1a | |
| Delta bubble number | **7pt** | Bold | varies | In circle bubble |
| Company table segment label | **8–9pt** | Bold | #ffffff | Vertically centered |

### Paragraph Spacing
```
Body paragraph spacing after:   6pt
Body paragraph spacing before:  0pt
Line spacing (body):            14.04pt (measured) — approximately 1.2× a 11.7pt font
Section title spacing before:   14–16pt
Section title spacing after:    2pt (rule immediately follows)
Green subheading spacing after: 4pt
Bullet item spacing after:      3pt
```

---

## PART 4: RUNNING PAGE ELEMENTS

### Running Header (all content pages)
```
Layout:     Left text | Right page number
Text:       "Applied Value – Building Materials & Products Market Health 2025 YTD"
Font:       7.5–8pt, Regular, color #5a5a5a
Position:   ~15–18pt from top of page
Rule below: 1.5–2pt thick, full text width, color #163e2d
Rule y:     ~25–30pt from top of page
```

### Page Number
```
Position:   Top-right, same baseline as running header text
Font:       8pt, Regular, #5a5a5a
Format:     Just the numeral (e.g., "3")
```

### AV Diamond Logo (bottom-right corner, every content page)
```
Image file:     08_av_diamond_footer.png  (103×150px extracted asset)
Position:       Bottom-right corner
From right:     0.300in (21.6pt)
From bottom:    0.878in (63.2pt)
Rendered size:  ~24×35pt (scale proportionally from 103:150 ratio)
Color:          Dark green #163e2d (outline only, transparent interior)
```

---

## PART 5: PAGE-BY-PAGE SPECIFICATIONS

---

### PAGE 1 — COVER PAGE

```
LAYOUT ZONES (from top, in inches):
  Zone 1 — White area:        0.00in → 4.36in  (top 39.6%)
  Zone 2 — Cityscape photo:   4.36in → 7.56in  (3.2in tall)
  Zone 3 — Dark overlay box:  5.69in → 8.31in  (overlaps photo + extends below)
  Zone 4 — White footer area: 8.31in → 11.00in (bottom 24.5%)
```

**Zone 1 — White area:**
- AV Logo (diamond): top-left at (0.329in, 0.334in)
- Logo size: ~35pt wide × ~50pt tall
- Logo file: `02_av_logo_cover.png`
- Thin horizontal green rule: immediately below logo area, full page width
  - Color: #215d44 (cover green)
  - Thickness: 2pt
  - y-position: ~1.15in from top

**Zone 2 — Cityscape photo:**
- Image file: `01_cover_cityscape.png` (917×627px RGB)
- Spans full page width (edge to edge, no margins)
- Top of photo: 4.36in from page top
- Bottom of photo: 7.56in from page top (3.2in height)
- Photo is black-and-white/desaturated Miami skyline
- The top edge of the photo has a subtle white-to-gray gradient fade (~0.3in gradient)

**Zone 3 — Dark green text box (overlaid on bottom of photo + white zone below):**
```
Left edge:   1.889in from left (x=500px at 264.7 DPI)
Right edge:  8.304in from left (x=2198px at 264.7 DPI)
Top:         7.69in from top   (y=2035px at 264.7 DPI) — starts just below photo
Bottom:      8.31in from top   (y=2200px at 264.7 DPI)
Width:       6.415in
Height:      0.622in
Background:  #215d44 (AV Cover Green)
```

Inside the box (from top):
```
  Row 1 — Title text:       "Building Materials & Products" (line 1), "Market Health Report" (line 2)
                              Font: 20–22pt Bold, White #ffffff
                              Left padding: ~14pt from box left edge
                              Top padding: ~8pt from box top

  Separator line:           1pt White rule, full box width
                              y: ~0.4in below box top

  Row 2 — Date line:        "2025 YTD" (left) + "November 2025" (right), same baseline
                              Font: 11–12pt Regular, White #ffffff
                              Vertical padding: ~5pt above and below
```

NOTE: Between the photo bottom and the box top (~7.56in to ~7.69in), there is a short white/light section. The box appears to have a dark charcoal upper region (partially transparent over photo) that transitions to solid #215d44.

**Zone 4 — Footer:**
```
Left column (x=23.66pt):
  "Applied Value"          — 9pt Bold Black
  "One Biscayne Tower"     — 8pt Regular Black
  "2 S Biscayne Blvd. Suite 1750" — 8pt Regular Black
  "Miami, FL 33131"        — 8pt Regular Black
  [blank line]
  "www.appliedvaluegroup.com" — 8pt Regular, #2c654d (green link)

Right column (starting at ~40% from left):
  "By: Jacob Wozniewski, Gavin Gattuso, and Alex Schneider"
  Font: 10pt Regular Black
  Vertical alignment: aligned with "Applied Value" bold text
```

---

### PAGE 2 — TABLE OF CONTENTS

```
LAYOUT: Two-column split
  Left column (text):   x = 23.66pt → 390pt  (approx 55% of width)
  Vertical green rule:  x ≈ 390–394pt, y = 0 → full page height
                        Color: #2c654d, Width: ~2pt
  Right column (photo): x = 394pt → 566.58pt (remaining 45%)
```

**Left column content:**
```
Section title:      "Building Materials & Products Market Health Report"
                    20–22pt Bold Black, starts at ~200.7pt from top
Subtitle:           "(2025 YTD)"
                    14–16pt Bold Black, below title + 8pt gap
Section rule:       2pt #163e2d, full left-column width, below subtitle

TOC Items (each):
  Bullet: "›" character, color #2c654d, 10pt Bold
  Text:   10pt Regular Black, 8pt left indent after ›
  Line spacing: 1.3× (≈ 13pt)
  Sub-items: additional 12pt indent

Page number ("2"):  Bottom-left, 8pt gray
```

**Right column content:**
```
Image file:  03_toc_cityscape.png (724×2384px)
Fills:       Full right-column width, top-to-bottom edge of page
Object fit:  cover (crop to fill)
Photo type:  Nighttime aerial city, more zoomed in than cover
AV Diamond:  Bottom-right of right column (same footer logo)
```

---

### PAGES 3–13 — STANDARD CONTENT PAGES

```
HEADER ZONE (top of every content page):
  Running header text:  y ≈ 14pt from top, left-aligned at 23.66pt
  Green rule:           y ≈ 25–30pt, #163e2d, ~1.5pt thick, spans 23.66pt → 566.58pt+23.66pt

CONTENT ZONE:
  Starts: y ≈ 40pt from top
  Left margin: 23.66pt
  Right margin: page_width − 23.66pt = 588.34pt from left
  Text width: 566.58pt

SECTION TITLE STYLE:
  Font:       16–18pt Bold, #1a1a1a
  Spacing before: 14pt (if not first section on page)
  After title: immediately followed by 2pt #163e2d horizontal rule, full text width
  After rule: 8pt space before body text

GREEN SUBHEADING STYLE:
  Font:       10–11pt Bold, #215d44
  Spacing before: 8pt
  Spacing after:  4pt

BODY TEXT STYLE:
  Font:       9–10pt Regular, #1a1a1a
  Alignment:  Justified (full justify)
  Line spacing: 14.04pt (measured)
  Para spacing: 6pt after each paragraph

BULLET LIST STYLE (Impact/Implication blocks):
  Character:  "›" (U+203A RIGHT-POINTING ANGLE QUOTATION MARK)
  Bullet color: #2c654d (medium green)
  Text color: #1a1a1a
  Font:       9–10pt Regular
  Hanging indent: 12pt
  Item spacing: 3pt after

BOLD INLINE LABELS (e.g., "Impact on Construction:"):
  Font:       9–10pt Bold, #1a1a1a
  Followed by: regular text on same line
  Examples:
    "Impact on Construction:"
    "Implication for Materials & Products:"

CALLOUT/INFO BOX (e.g., page 11 "Why GDP Strength..."):
  Background:    #f2f2f2
  Left border:   3pt solid #163e2d
  Padding:       8pt all sides
  Title font:    9.5pt Bold Italic, #1a1a1a (format: "N. Title Text")
  Body font:     9pt Regular, #1a1a1a, justified

FOOTER ELEMENT (every content page):
  AV Diamond logo: bottom-right corner (see Part 4)
```

---

### PAGE 6 — DRIVERS OF MARKET HEALTH TABLE

**Table structure and colors:**
```
Column widths (approx, within 566.58pt text width):
  Col 1 — DRIVER:          ~130pt  (23%)
  Col 2 — SUMMARY:         ~260pt  (46%)
  Col 3 — INDICATOR TYPE:  ~80pt   (14%)
  Col 4 — RECENT TREND:    ~96pt   (17%)

HEADER ROW:
  Background:      #163e2d (AV Dark Green, pixel-verified)
  Text:            8–9pt Bold, UPPERCASE, #ffffff
  Cell padding:    6pt top/bottom, 8pt left/right
  Row height:      ~28pt (pixel-verified from 300 DPI)

DRIVER NAME CELLS (col 1):
  Background:      #163e2d (same dark green as header)
  Text:            8–9pt Bold, UPPERCASE, #ffffff
  Vertical align:  Middle
  Cell padding:    6pt top/bottom, 8pt left/right

SUMMARY CELLS (col 2):
  Background:      #ffffff
  Text:            8–8.5pt Regular, #1a1a1a, left-aligned
  Cell padding:    6pt top/bottom, 8pt left/right

INDICATOR TYPE CELLS (col 3):
  Background:      #ffffff
  Content:         Double-arrow icon — "»" (leading) or "«" (lagging)
                   Color: #163e2d, Size: ~18pt Bold, centered
  Cell padding:    4pt all sides

RECENT TREND CELLS (col 4):
  Background:      #ffffff
  Text:            8–9pt Bold, centered
  Colors:
    "Positive" → color #00b050 (pixel-verified)
    "Negative" → color #fc595c (pixel-verified)
    "Neutral"  → color #ffa347

ROW BORDERS:
  Horizontal lines between rows: 0.5pt, #d0d0d0

VERTICAL BORDERS:
  Only between columns: 0.5pt, #d0d0d0

LEGEND (below table):
  Two rectangular swatches + labels
    Swatch 1: 16×10pt, filled #163e2d, label "Leading"
    Swatch 2: 16×10pt, filled #8f8f8f, label "Lagging"
  Font: 8pt Italic, #1a1a1a
  Spacing: 6pt above legend from table bottom
```

---

### PAGE 15 — COMPANY PERFORMANCE TABLE

**Table structure:**
```
Columns:
  Col 1 — Segment:                  ~90pt   (merged rows per segment)
  Col 2 — Company (Ticker):         ~130pt
  Col 3 — Headline Performance:     ~346pt  (remaining width)

HEADER ROW:
  Background: #163e2d
  Text: 8–9pt Bold, #ffffff

SEGMENT CELLS (col 1):
  Background by segment:
    Aggregates & Cement, Fiberglass, Wood Products:  #163e2d  (dark green)
    Distribution, Roofing Distribution,
    Roofing & Insulation, Insulation & Panels:       #ffa347  (orange — pixel verified)
    Doors & Windows, Water Mgmt, Kitchen & Bath,
    Infrastructure/MEP, Retail/R&R:                  #2cafea  (sky blue — pixel verified)

  Text: 8–9pt Bold, #ffffff
  Vertical merge: spans all companies in segment
  Vertical alignment: middle
  Cell padding: 6pt top/bottom, 8pt left

COMPANY CELLS (col 2):
  Background: #ffffff
  Text: 8–8.5pt Regular, #1a1a1a

HEADLINE CELLS (col 3):
  Background: #ffffff
  Text: 8–8.5pt Regular, #1a1a1a, left-aligned

ROW BORDERS: 0.5pt, #d0d0d0 horizontal lines

KEY/LEGEND (bottom of table):
  Three colored boxes (16pt × 10pt each) + labels:
    Box 1: #163e2d  "Nonresidential Forward"
    Box 2: #ffa347  "Distribution"
    Box 3: #2cafea  "Residential Forward"
  Font: 8pt Italic, label preceded by colored box
```

---

### PAGES 18–21 — HORIZONTAL BAR CHART PAGES

**Page layout:**
```
  Large bold headline:   18–20pt Bold Black, full text width, above panels
  Two side-by-side panels:
    Left panel label:   "Building Materials [Metric] ..."
    Right panel label:  "Building Products [Metric] ..."
    Each label: 8pt Bold, left-aligned for metric, right-aligned for "YoY % Delta p.p."
    Divider between panels: ~12pt gap (no visible rule)
```

**Horizontal bar chart elements:**
```
BAR COLORS (left panel — Building Materials):
  Cement/Aggregates:    #163e2d  (dark green)
  Glass:                #215d44  (medium green)
  Lumber & Wood:        #1ba9e9  or teal variant
  Steel:                #b5b5b5  (gray — pixel verified)
  Bricks & Masonry:     #8f8f8f  (dark gray)

BAR COLORS (right panel — Building Products):
  Building Envelope/Roofing: #163e2d (dark green/teal)
  Doors & Windows:      #2cafea  (sky blue)
  Kitchen & Bath:       #67c6f1  (light blue — pixel verified)
  Piping:               #adc8d4  (pale blue-gray)
  HVAC-R:               #b5b5b5  (gray)

BAR SPECS:
  Bar height:           ~8–10pt per bar
  Gap between bars:     ~4pt
  Zero line:            0.5pt solid #d0d0d0 vertical
  Company labels:       8pt Regular, left-aligned, y-centered with bar

DELTA BUBBLES (right column of each panel):
  Shape:      Circle, ~14–16pt diameter
  Positive:   Fill #d7eae1 (light green), Text color #163e2d
  Negative:   Fill #e8b6bb (salmon), Text color #c0392b (dark red)
  Font:       7pt Bold, centered in bubble
  Spacing:    ~6pt right of bar chart area

AVERAGE MARKER:
  Symbol: "▲" (upward triangle) + "Ø X.X" label
  Color:  #8f8f8f
  Font:   7.5pt Regular
  Position: Below last bar, at x-position of average value
  Placed at bottom center of chart, x aligns with mean bar length

COLOR LEGEND (top of each page, above panels):
  10 colored squares (8×8pt each) in two rows
  Each with label, 7.5pt Regular, black
  Spacing: 6pt between items
```

---

### PAGE 16 — SHARE PRICE PERFORMANCE CHART

```
Large bold headline (above chart, not a figure caption):
  "The factors listed above have split returns for building
   materials and products firms, with non-residential-aligned
   players outperforming residential-focused peers."
  Font: 18pt Bold, #1a1a1a, full text width

Subheading below headline:
  "Share price performance, YTD returns by segment"
  Font: 10pt Bold, #1a1a1a
  Followed by 1pt #d0d0d0 rule, full width

Chart specs:
  Y-axis: 70 to 140 (indexed, 100 = Jan 2025 baseline)
  X-axis: Monthly: 01/25 through 12/25
  Grid:   Horizontal only, 0.5pt #e0e0e0, at 80, 90, 100, 110, 120, 130
  Lines:
    S&P 500:          #e8833a (orange — pixel verified), 1.5pt
    Building Materials: #215d44 (green), 1.5pt
    Building Products:  #1ba9e9 (teal), 1.5pt

  Return labels at right end of each line:
    Format: "XX.X%"
    Font: 9pt Bold, same color as line
    Values: 14.6%, 5.2%, -1.7%

  Annotation boxes (2 boxes inside chart):
    Fill: #fff8e7 (light cream/beige)
    Border: 0.5pt #d0a000
    Font: 7.5–8pt Italic, #1a1a1a
    Positioned within the chart area, connected to relevant data regions
```

---

### PAGE 17 — COMPANY UNIVERSE TABLE

```
Large bold headline:
  "This report analyzes the financial performance of 35
   building materials and products companies operating in
   the US, and covers 500 BUSD in revenue"
  Font: 20–22pt Bold, #1a1a1a

Two side-by-side tables (Building Materials | Building Products):
  Each table has 4 columns: Segment | Company | Revenue (LTM BUSD) | Country

SEGMENT CELLS:
  Merged rows, left column
  Background: #163e2d
  Text: 8pt Bold, #ffffff, with leading icon (building/material emoji)

REVENUE COLUMN:
  Contains a horizontal mini-bar (proportional fill)
  Bar color: #163e2d (dark green)
  Dollar label: 8pt Regular, right of bar: "$XX.X"

COUNTRY COLUMN:
  Contains circular flag icon (~12pt diameter)

FOOTER TOTALS ROW (below each column):
  Icon + dollar total
  Font: 8pt, Italic, colored per segment

SUMMARY LINES:
  "The report covers 351 BUSD of building materials revenue"
  "The report covers 186 BUSD of building products revenue"
  Font: 8pt Italic, #215d44 (green)
```

---

### PAGE 22 — APPENDIX / Q3 IN REVIEW

```
Section title: "Appendix" — 20pt Bold, #1a1a1a
Green subheading: "Appendix #1: Applied Value Q3-2025 in Review" — 11pt Bold, #215d44

Q3 BANNER BOX (full-width, ~2.5in tall):
  Image file: 05_q3_appendix_banner.png (1080×1150px)
  This image contains:
    - Top half: black/dark background with "APPLIED VALUE CONSULTING Q3 2025 IN REVIEW"
                AV diamond logo (outline, white) top-left
                Grayscale cityscape right half
    - Text color on image: white
    - Title font on image: ~16pt Bold, UPPERCASE, white
  Rendered width: full text width (566.58pt)
  Rendered height: ~140pt (proportional)
  Border: 0.5pt #d0d0d0

METRICS ROW (6 stats, below banner):
  Layout: 6 equal columns
  Each column:
    Icon:      ~20pt (line chart, dollar, handshake, globe, people, leaf icons)
               Black, centered
    Number:    22–24pt Bold, #1a1a1a, centered (e.g. "48", "$1B+", "24")
    Label:     8pt Bold Italic, #1a1a1a, centered, 2 lines
    (e.g. "Unique Projects\nDelivered")
  Dividers: subtle 0.5pt #d0d0d0 between columns
  Total row height: ~55pt

TWO-COLUMN SECTION (below metrics):
  Left: "Functions Supported" + pie chart
    Header: 11pt Bold Black
    Chart: donut/pie, ~130pt diameter
    Labels inside: 7pt Regular
    Segments: 4 slices (green tones + gray)

  Right: "Select Q3 Engagements"
    Header: 11pt Bold Black
    Each engagement:
      Title: 10pt Bold, #1a1a1a
      Rule:  0.5pt #d0d0d0, full column width
      Body:  7.5pt Regular, #1a1a1a

EXCITING NEWS BOX (full width, bottom):
  Border: 1pt #163e2d (all sides)
  Background: #ffffff
  "Exciting News:" label: 10pt Bold Italic, #1a1a1a
  Body text: 11–12pt Regular, #1a1a1a (larger than normal body)
  Padding: 10pt all sides
```

---

### PAGE 23 — CONTACT / ADDITIONAL REPORTS

```
SECTION TITLE: "Appendix #2: Additional Reports & Contact Information"
  Style: Green subheading (11pt Bold, #215d44)

REPORTS TABLE:
  Columns: Report | Frequency | Owner | Email
  Header row: #163e2d bg, white text, 8pt Bold
  Body rows: alternating #ffffff / #f5f5f5
  Border: 0.5pt #d0d0d0
  Email column: #2c654d (green), underlined

CONTACT CARDS (3 equal columns):
  Each card:
    Name: 9pt Bold, #1a1a1a
    Title: 8pt Regular, #1a1a1a
    Phone: 8pt Regular, #1a1a1a
    City: 8pt Bold, #215d44
    Icons: small email envelope + LinkedIn icon (~10pt)
  Vertical dividers: 0.5pt #d0d0d0 between cards

FOOTER TEXT (bottom):
  "Applied Value Group is a premier boutique management consulting..."
  Font: 8pt Italic, #5a5a5a
  
Copyright line: "© Applied Value Group 2020. All rights reserved. 08.2025"
  Font: 7.5pt Regular, #5a5a5a, centered
```

---

### PAGE 24 — BACK COVER

```
LAYOUT (top to bottom):
  Zone 1 — White/gradient fade:  0 to ~3.5in
  Zone 2 — Cityscape photo:      3.5in to ~7.5in
  Zone 3 — Solid green band:     7.5in to 11.0in

Zone 1: White background with top fade (photo gradually appears from bottom of zone)

Zone 2:
  Image file: 06_backcover_cityscape.png (1624×914px)
  Different photo than cover — wider angle, daytime, reflections in water
  Full page width, no margins
  Greyscale/desaturated

Zone 3 — Solid Green Band:
  Background: #215d44 (AV Cover Green, same as cover box)
  Height: ~3.5in
  Content (centered):
    AV Diamond logo (large): 
      Image file: 07_backcover_av_logo_green.png (690×627px)
      Rendered: ~80pt wide, color #ffffff (white version of logo on green bg)
    "APPLIED VALUE GROUP" text:
      Font: 14–16pt Regular or Light, #ffffff, centered
      Letter spacing: slightly expanded (0.05em)
      y: ~20pt below logo bottom
```

---

## PART 6: CHART SPECIFICATIONS (GENERIC)

```
ALL LINE/AREA CHARTS:
  Background:      #ffffff (no box/border around chart)
  Plot area bg:    #ffffff
  Grid lines:      Horizontal only, 0.5pt, #e8e8e8
  Axis lines:      Left axis: 0.5pt #5a5a5a; Bottom axis: 0.5pt #5a5a5a
                   No top or right axis lines
  Axis labels:     7.5pt Regular, #5a5a5a
  Tick marks:      None (no tick marks)
  Line weight:     1.5pt for all data series
  No markers on lines (smooth lines only)
  Legend:          Inside chart area, top-left or top-center, 8pt text
                   Swatch = 20pt line segment colored per series

FIGURE CAPTIONS (above chart):
  Format: "Figure N: [Description]"
  Font:   8pt Italic, #5a5a5a
  Alignment: Left-aligned with chart left edge
  Spacing: 4pt before caption, 2pt after (before chart)

SOURCE LINES (below chart):
  Format: "Source: Capital IQ, Applied Value analysis"
  Font:   7.5pt Regular, #6e6e6e
  Spacing: 4pt above source line
  Footnotes: "1) text..." on separate lines, 7pt

Y-AXIS DOLLAR FORMATTING:
  Trillions: "$X.XT" or "$X.X T"
  Billions:  "$XXXB" or "$XXXB"
  Percent:   "X%"
  Thousands: "XXXK"
```

---

## PART 7: ASSETS MANIFEST

All images are in the `images/` subfolder. Use as follows:

| Filename | Dimensions | Usage | Notes |
|---|---|---|---|
| `01_cover_cityscape.png` | 917×627px | Cover page photo (Zone 2) | B&W Miami skyline |
| `02_av_logo_cover.png` | 112×161px | Cover top-left logo | Dark green diamond |
| `03_toc_cityscape.png` | 724×2384px | TOC right column | Nighttime city, portrait crop |
| `04_housing_permits_legend.png` | 1520×309px | Pg 9 housing permits bar | Wide legend bar graphic |
| `05_q3_appendix_banner.png` | 1080×1150px | Appendix pg 22 banner | Dark bg + city |
| `06_backcover_cityscape.png` | 1624×914px | Back cover photo | Wider angle, reflection |
| `07_backcover_av_logo_green.png` | 690×627px | Back cover center | White logo on green |
| `08_av_diamond_footer.png` | 103×150px | Footer every page (bottom-right) | Small diamond, dark green |

---

## PART 8: IMPLEMENTATION NOTES FOR CLAUDE CODE

### Recommended Python stack
```python
# For PDF generation:
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, Image, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import pt, inch

# Key constants
DARK_GREEN    = HexColor('#163e2d')
COVER_GREEN   = HexColor('#215d44')
MED_GREEN     = HexColor('#2c654d')
POSITIVE_GRN  = HexColor('#00b050')
NEGATIVE_RED  = HexColor('#fc595c')
ORANGE        = HexColor('#ffa347')
TEAL_BLUE     = HexColor('#2cafea')
CHART_TEAL    = HexColor('#1ba9e9')
STEEL_GRAY    = HexColor('#b5b5b5')
SALMON_BUBBLE = HexColor('#e8b6bb')
GREEN_BUBBLE  = HexColor('#d7eae1')
BODY_TEXT     = HexColor('#1a1a1a')
HEADER_GRAY   = HexColor('#5a5a5a')
RULE_GRAY     = HexColor('#d0d0d0')

LEFT_MARGIN   = 23.66 * pt       # 0.329 inches
RIGHT_MARGIN  = 23.66 * pt
TEXT_WIDTH    = 566.58 * pt      # 7.869 inches
```

### Key construction notes
1. The cover page requires absolute positioning — use a Canvas directly, not flowables
2. The running header+rule must appear on every content page — use a PageTemplate with a Frame starting below the header zone (top y ≈ 40pt from page top)
3. Table row heights in the drivers table must accommodate multi-line text in driver cells — use `VALIGN MIDDLE` and fixed min-row-height of ~30pt
4. Delta bubbles are best rendered as small SVG circles or PIL-drawn images inserted inline
5. The AV diamond footer logo must be placed with absolute coordinates on every page using `canvas.drawImage()` at (page_width - 0.300in - logo_width, 0.878in from bottom)
6. TOC page vertical green rule: draw with canvas.line() at x ≈ 390pt, y from 0 to page height, color #2c654d, width 2pt
