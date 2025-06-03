import type { NextApiRequest, NextApiResponse } from "next";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

type CSSRule = {
  selector: string;
  used: boolean;
  bytes: number;
};

type CSSFileDetail = {
  url: string;
  total: number;
  used: number;
  unusedRules: CSSRule[];
};

type CSSUsageResult = {
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
  files: CSSFileDetail[];
};

// Cache for storing results
const resultCache = new Map<
  string,
  { result: CSSUsageResult; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Helper functions
const parseCSSRules = (cssText: string): string[] => {
  const rules: string[] = [];
  let currentRule = "";
  let braceCount = 0;

  for (let i = 0; i < cssText.length; i++) {
    const char = cssText[i];
    currentRule += char;

    if (char === "{") braceCount++;
    if (char === "}") {
      braceCount--;
      if (braceCount === 0) {
        rules.push(currentRule.trim());
        currentRule = "";
      }
    }
  }

  return rules;
};

const isRuleUsed = (
  rule: string,
  cssText: string,
  ranges: { start: number; end: number }[]
): boolean => {
  const ruleStart = cssText.indexOf(rule);
  if (ruleStart === -1) return false;

  return ranges.some(
    (range) => ruleStart >= range.start && ruleStart + rule.length <= range.end
  );
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CSSUsageResult | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { url } = req.body;

  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  // Check cache
  const cached = resultCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.result);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Set timeout for navigation
    page.setDefaultNavigationTimeout(30000);

    // Start CSS coverage
    await page.coverage.startCSSCoverage();

    // Navigate to URL with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Wait for any dynamic content
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const cssCoverage = await page.coverage.stopCSSCoverage();

    let totalBytes = 0;
    let usedBytes = 0;
    const files: CSSFileDetail[] = [];

    for (const entry of cssCoverage) {
      const total = entry.text.length;
      const used = entry.ranges.reduce(
        (sum, range) => sum + (range.end - range.start),
        0
      );
      totalBytes += total;
      usedBytes += used;

      // Parse CSS rules more efficiently
      const rules = parseCSSRules(entry.text);
      const unusedRules: CSSRule[] = [];

      for (const rule of rules) {
        const selector = rule.split("{")[0].trim();
        const ruleBytes = rule.length;

        if (!isRuleUsed(rule, entry.text, entry.ranges)) {
          unusedRules.push({
            selector,
            used: false,
            bytes: ruleBytes,
          });
        }
      }

      files.push({
        url: entry.url || "inline <style>",
        total,
        used,
        unusedRules,
      });
    }

    const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    const result = {
      totalBytes,
      usedBytes,
      usagePercent,
      files,
    };

    // Cache the result
    resultCache.set(url, { result, timestamp: Date.now() });

    res.status(200).json(result);
  } catch (error) {
    console.error("CSS analysis error:", error);
    if (error instanceof Error) {
      res.status(500).json({ error: `CSS analysis failed: ${error.message}` });
    } else {
      res.status(500).json({ error: "CSS analysis failed" });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
