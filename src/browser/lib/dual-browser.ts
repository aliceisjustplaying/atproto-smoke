import path from "node:path";
import type { Page } from "playwright";
import { chromium } from "./playwright-runtime.js";
import {
  attachPageLogging,
  buttonText,
  closeBrowserSafely,
  createStepRunner,
  createProgressEmitter,
  finalizeSummary,
  launchBrowserWithFallback,
  normalizeText,
} from "./runtime-utils.js";
import {
  isIgnoredConsoleEntry,
  isIgnoredHttpFailureEntry,
  isIgnoredRequestFailureEntry,
} from "./failure-rules.js";
import type { Summary } from "../../types.js";

export const setupDualBrowser = async ({ config, summary }) => {
  const browser = await launchBrowserWithFallback({
    chromium,
    config,
    summary,
  });
  const primaryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const secondaryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const primaryPage = await primaryContext.newPage();
  const secondaryPage = await secondaryContext.newPage();

  attachPageLogging({
    summary,
    page: primaryPage,
    pageName: "primary",
    xrpcLimit: 300,
  });
  attachPageLogging({
    summary,
    page: secondaryPage,
    pageName: "secondary",
    xrpcLimit: 300,
  });

  return {
    browser,
    primaryContext,
    secondaryContext,
    primaryPage,
    secondaryPage,
  };
};

export const createDualStepHelpers = ({
  config,
  summary,
  primaryPage,
  secondaryPage,
}: {
  config: { artifactsDir: string; progress?: boolean; stepTimeoutMs?: number };
  summary: Summary;
  primaryPage: Page;
  secondaryPage: Page;
}) => {
  const stepTimeoutMs = Number(config.stepTimeoutMs || 120000);
  const progressEnabled = config.progress !== false;
  const pageFor = (name: string): Page =>
    name === "primary" ? primaryPage : secondaryPage;

  const emitProgress = createProgressEmitter({ enabled: progressEnabled });

  const screenshot = async (pageName: string, name: string): Promise<string> => {
    const page = pageFor(pageName);
    const file = path.join(config.artifactsDir, `${name}-${pageName}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  };

  const step = createStepRunner({
    summary,
    emitProgress,
    defaultTimeoutMs: stepTimeoutMs,
    captureArtifacts: async ({ name, pageNames, failed }) => {
      const screenshots: Record<string, string | undefined> = {};
      for (const pageName of pageNames ?? []) {
        screenshots[pageName] = await screenshot(
          pageName,
          failed ? `${name}-error` : name,
        ).catch(() => undefined);
      }
      return { screenshots };
    },
  });

  const wait = async (page: Page, ms: number): Promise<void> => {
    await page.waitForTimeout(ms);
  };

  return {
    screenshot,
    normalizeText,
    isIgnoredConsole: isIgnoredConsoleEntry,
    isIgnoredRequestFailure: isIgnoredRequestFailureEntry,
    isIgnoredHttpFailure: isIgnoredHttpFailureEntry,
    step,
    wait,
    buttonText,
  };
};

export const finalizeDualSummary = ({
  summary,
  config,
  screenshot,
  browser,
  isIgnoredConsole,
  isIgnoredRequestFailure,
  isIgnoredHttpFailure,
}) => {
  finalizeSummary({
    summary,
    strictErrors: config.strictErrors,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
  });
  return Promise.all([
    screenshot("primary", "final").catch(() => undefined),
    screenshot("secondary", "final").catch(() => undefined),
  ])
    .then(() => closeBrowserSafely({ browser, summary }))
    .then(() => summary);
};
