import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, Header, Footer,
  AlignmentType, BorderStyle, PageNumber
} from 'docx';
import * as fs from 'fs';

const accentColor = "1B4F72";

const stories = [
  {
    headline: "Iran War Accelerates Global Shift to Solar and Renewables",
    source: "Bloomberg",
    summary: "The Iran conflict and resulting Strait of Hormuz blockade \u2014 locking out roughly 20% of global oil and gas supply \u2014 is pushing countries to accelerate their renewable energy investments. IEA chief Fatih Birol said countries were likely to pivot to renewables to mitigate geopolitical risk, with over 90% of new renewable projects now cheaper than fossil fuel alternatives.",
    url: "https://www.bloomberg.com/news/articles/2026-03-05/iran-war-could-push-countries-to-adopt-more-solar-and-batteries"
  },
  {
    headline: "Solar Stocks Soar \u2014 TAN ETF Up 62% Since Trump Inauguration",
    source: "CNBC",
    summary: "The Invesco Solar ETF (TAN) is outperforming almost every sector except energy, up 16% year-to-date and 62% since President Trump\u2019s inauguration. Technical analysts say the charts point to continued upside as tariffs on Chinese imports and Big Tech\u2019s renewable energy purchases drive domestic solar demand.",
    url: "https://www.cnbc.com/2026/04/02/the-charts-are-showing-solar-stocks-will-keep-soaring-after-a-strong-start-to-2026.html"
  },
  {
    headline: "U.S. Slaps 126% Tariffs on Indian Solar Imports",
    source: "Bloomberg",
    summary: "The Trump administration set preliminary duties of 126% on solar imports from India, with rates of 86-143% for Indonesia and 81% for Laos. The Commerce Department determined these countries unfairly subsidized manufacturing, undercutting domestic producers. Indian solar stocks plunged on the announcement.",
    url: "https://www.bloomberg.com/news/articles/2026-02-24/us-finds-that-india-indonesia-laos-unfairly-subsidized-solar"
  },
  {
    headline: "Tariffs and Tax Credit Cuts Set to Raise Home Solar Prices in 2026",
    source: "Bloomberg",
    summary: "The elimination of U.S. tax credits for residential solar panels, heat pumps, and batteries combined with tariffs and made-in-America mandates are making home electrification more expensive in 2026. Congress is weighing further cuts to solar incentives to fund Trump\u2019s broader tax package.",
    url: "https://www.bloomberg.com/news/articles/2026-01-03/tariffs-manufacturing-rules-to-raise-home-solar-prices-in-2026"
  },
  {
    headline: "First Solar Expands U.S. Manufacturing as Big Tech Drives Demand",
    source: "CNBC",
    summary: "First Solar, the only major U.S.-headquartered solar manufacturer, opened a new Louisiana facility adding 3.7 GW of annual capacity, bringing total output to about 24 GW. Their contracted backlog stands at $16.4 billion (54.5 GW) extending through 2030, driven by Amazon, Microsoft, Meta, and Google \u2014 which now represent 40% of utility-scale solar demand.",
    url: "https://www.cnbc.com/2026/01/22/this-solar-stock-in-josh-browns-best-stocks-list-could-soon-break-out-to-20-year-highs.html"
  },
  {
    headline: "Global Solar Installations Set to Decline for First Time in 2026",
    source: "Bloomberg",
    summary: "Solar installations are forecast to fall for the first time since records began in 2000, with the world set to add 649 GW in 2026, down slightly from 2025. Policy shifts, saturation in key markets like China, and the withdrawal of subsidies are tempering demand after years of explosive growth.",
    url: "https://www.bloomberg.com/news/articles/2025-12-16/global-solar-additions-to-fall-for-first-time-in-2026-says-bnef"
  },
  {
    headline: "Perovskite-Silicon Tandem Solar Cells Hit Record 33.6% Efficiency",
    source: "Nature",
    summary: "Researchers demonstrated a certified 33.6% efficient flexible perovskite/crystalline silicon tandem solar cell with a record open-circuit voltage of 2.015V. The breakthrough combines high efficiency with mechanical robustness, as the solar industry enters a transformative phase with perovskite commercialization and gigawatt-scale production facility announcements.",
    url: "https://www.nature.com/articles/s41586-025-09849-4"
  },
  {
    headline: "LONGi to Replace Silver in Solar Panels to Slash Manufacturing Costs",
    source: "Bloomberg",
    summary: "Chinese solar giant LONGi Green Energy announced it will begin substituting base metals for silver in its solar cells, with mass production expected to start in Q2 2026. The move addresses one of the industry\u2019s biggest cost pressures as silver prices have surged, and could significantly reduce module manufacturing costs globally.",
    url: "https://www.bloomberg.com/news/articles/2026-01-05/china-s-longi-to-replace-silver-in-solar-panels-to-reduce-costs"
  },
  {
    headline: "China Scraps Solar Export Rebate, Triggering Demand Whiplash",
    source: "Bloomberg",
    summary: "A Chinese tax change effective April 1 scrapped export incentives for solar panels, designed to promote industry consolidation. Manufacturers scrambled to ship orders ahead of the deadline, followed by an expected sharp drop-off in exports. The move is raising costs for solar infrastructure globally while benefiting domestic U.S. producers.",
    url: "https://www.bloomberg.com/news/articles/2026-01-26/china-solar-giant-warns-of-demand-whiplash-after-rebate-rollback"
  },
  {
    headline: "China Plans Large-Scale Solar Panel Recycling Program by 2030",
    source: "Bloomberg",
    summary: "China announced plans to upgrade its solar module recycling capacity, targeting 250,000 tons of retired panels by 2027 as part of a broader push toward \u201Clarge-scale retirement of solar modules\u201D by 2030. With 2 TW of solar PV now deployed globally, end-of-life management is becoming a critical industry challenge.",
    url: "https://www.bloomberg.com/news/articles/2026-03-03/china-aims-to-upgrade-solar-scrapping-capability-as-panels-age"
  },
  {
    headline: "MAGA Influencers Embrace Solar as Right Reckons with Energy Reality",
    source: "Washington Post",
    summary: "In a notable political shift, right-wing influencers including Katie Miller and other MAGA figures have begun promoting solar power, as conservatives reckon with solar\u2019s crucial role in powering AI data centers and keeping utility bills in check. The solar industry has reframed its messaging around affordability and energy dominance rather than climate goals.",
    url: "https://www.washingtonpost.com/business/2026/03/02/katie-miller-solar-power-trump/"
  },
  {
    headline: "Silicon Ranch Secures $500M for Utility-Scale Solar Expansion",
    source: "Crunchbase News",
    summary: "Nashville-based Silicon Ranch, a leading utility-scale solar installer in the Southeastern U.S., secured $500 million from European infrastructure investor AIP Management. The company has now raised over $2 billion total, reflecting strong investor confidence in U.S. utility-scale solar despite policy headwinds.",
    url: "https://news.crunchbase.com/venture/biggest-funding-rounds-vc-startups-clean-energy/"
  },
  {
    headline: "Congress Weighs Cutting Solar Tax Credits to Fund Trump\u2019s Tax Package",
    source: "CNBC",
    summary: "Congressional Republicans are considering cutting the Investment Tax Credit (ITC) and Production Tax Credit (PTC) for solar to help pay for Trump\u2019s tax break package. Solar executives warn the move could trigger a major downturn in new renewable generation from late 2026 through 2028, potentially causing a power crunch and electricity price spikes.",
    url: "https://www.cnbc.com/2025/08/24/solar-wind-renewable-trump-tariff-utility-tax-credit-itc-ptc-obbb-electricity-price.html"
  }
];

const children: Paragraph[] = [];

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 80 },
  children: [new TextRun({ text: "SOLAR ENERGY WEEKLY BRIEFING", bold: true, size: 52, font: "Arial", color: accentColor })]
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 80 },
  children: [new TextRun({ text: "The Biggest Solar Energy Headlines This Week", size: 28, font: "Arial", color: "555555", italics: true })]
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "April 6, 2026", size: 24, font: "Arial", color: "777777" })]
}));

children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accentColor, space: 1 } },
  spacing: { after: 400 },
  children: []
}));

stories.forEach((story, i) => {
  children.push(new Paragraph({
    spacing: { before: 300, after: 120 },
    children: [
      new TextRun({ text: `${i + 1}. ${story.headline}`, bold: true, size: 26, font: "Arial", color: accentColor }),
      new TextRun({ text: `  (${story.source})`, size: 22, font: "Arial", color: "888888" })
    ]
  }));

  children.push(new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: story.summary, size: 22, font: "Arial", color: "333333" })]
  }));

  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: "Source", style: "Hyperlink", size: 20, font: "Arial" })],
        link: story.url
      })
    ]
  }));

  if (i < stories.length - 1) {
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD", space: 1 } },
      spacing: { after: 100 },
      children: []
    }));
  }
});

children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accentColor, space: 1 } },
  spacing: { before: 400, after: 200 },
  children: []
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0 },
  children: [new TextRun({ text: "Compiled by Jarvis AI Newsletter Assistant", size: 20, font: "Arial", color: "999999", italics: true })]
}));

const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Solar Energy Weekly Briefing \u2022 April 3, 2026", size: 16, font: "Arial", color: "AAAAAA", italics: true })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 16, font: "Arial", color: "AAAAAA" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: "AAAAAA" })
          ]
        })]
      })
    },
    children
  }]
});

const outputPath = "C:/Users/AidanChin/OneDrive - Applied Value/Desktop/Claude AI newsletter/newsletters/Solar_Energy_Weekly_Briefing_2026-04-06.docx";

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Newsletter saved to: ${outputPath}`);
}).catch(err => {
  console.error("Error generating document:", err);
});
