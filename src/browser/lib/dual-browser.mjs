import path from 'node:path';
import { chromium } from './playwright-runtime.mjs';
import {
  attachPageLogging,
  buttonText,
  closeBrowserSafely,
  createProgressEmitter,
  dismissBlockingOverlays,
  finalizeSummary,
  launchBrowserWithFallback,
  normalizeText,
  sleep,
} from './runtime-utils.mjs';
import {
  isIgnoredConsoleEntry,
  isIgnoredHttpFailureEntry,
  isIgnoredRequestFailureEntry,
} from './failure-rules.mjs';

export const setupDualBrowser = async ({ config, summary }) => {
  const browser = await launchBrowserWithFallback({ chromium, config, summary });
  const primaryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const secondaryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const primaryPage = await primaryContext.newPage();
  const secondaryPage = await secondaryContext.newPage();

  attachPageLogging({ summary, page: primaryPage, pageName: 'primary', xrpcLimit: 300 });
  attachPageLogging({ summary, page: secondaryPage, pageName: 'secondary', xrpcLimit: 300 });

  return {
    browser,
    primaryContext,
    secondaryContext,
    primaryPage,
    secondaryPage,
  };
};

export const createDualStepHelpers = ({ config, summary, primaryPage, secondaryPage }) => {
  const stepTimeoutMs = Number(config.stepTimeoutMs || 120000);
  const progressEnabled = config.progress !== false;
  const pageFor = (name) => (name === 'primary' ? primaryPage : secondaryPage);

  const emitProgress = createProgressEmitter({ enabled: progressEnabled });

  const screenshot = async (pageName, name) => {
    const page = pageFor(pageName);
    const file = path.join(config.artifactsDir, `${name}-${pageName}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  };

  const recordStep = (name, status, extra = {}) => {
    summary.steps.push({
      name,
      status,
      at: new Date().toISOString(),
      ...extra,
    });
  };

  const isIgnoredConsole = isIgnoredConsoleEntry;
  const isIgnoredRequestFailure = isIgnoredRequestFailureEntry;
  const isIgnoredHttpFailure = isIgnoredHttpFailureEntry;

  const step = async (name, fn, { optional = false, pageNames = [], timeoutMs } = {}) => {
    const effectiveTimeoutMs = Number(timeoutMs || stepTimeoutMs);
    emitProgress('start', name);
    let timeoutId;
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`step timed out after ${effectiveTimeoutMs}ms`));
          }, effectiveTimeoutMs);
        }),
      ]);
      const screenshots = {};
      for (const pageName of pageNames) {
        screenshots[pageName] = await screenshot(pageName, name);
      }
      recordStep(name, 'ok', { screenshots, ...(result ?? {}) });
      emitProgress('ok', name);
      return result;
    } catch (error) {
      const screenshots = {};
      for (const pageName of pageNames) {
        screenshots[pageName] = await screenshot(pageName, `${name}-error`).catch(() => undefined);
      }
      recordStep(name, optional ? 'skipped' : 'failed', {
        screenshots,
        error: String(error?.message ?? error),
      });
      emitProgress(optional ? 'skip' : 'fail', name, String(error?.message ?? error));
      if (!optional) {
        throw error;
      }
      return null;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  const wait = async (page, ms) => {
    await page.waitForTimeout(ms);
  };

  return {
    pageFor,
    screenshot,
    recordStep,
    normalizeText,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
    step,
    wait,
    sleep,
    buttonText,
    dismissBlockingOverlays,
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
    screenshot('primary', 'final').catch(() => undefined),
    screenshot('secondary', 'final').catch(() => undefined),
  ]).then(() => closeBrowserSafely({ browser, summary })).then(() => summary);
};
