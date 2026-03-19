import path from 'node:path';
import { chromium } from './playwright-runtime.mjs';
import {
  attachPageLogging,
  closeBrowserSafely,
  createProgressEmitter,
  finalizeSummary,
  launchBrowserWithFallback,
} from './runtime-utils.mjs';

const ignoredConsole = [
  /events\.bsky\.app\/.*ERR_BLOCKED_BY_CLIENT/i,
  /slider-vertical/i,
  /Password field is not contained in a form/i,
  /Failed to load resource: the server responded with a status of 400 \(\)/i,
];

const ignoredRequestFailure = [
  { url: /events\.bsky\.app\//i, error: /ERR_(BLOCKED_BY_CLIENT|ABORTED)/i },
  { url: /workers\.dev\/api\/config/i, error: /ERR_ABORTED/i },
  { url: /app-config\.workers\.bsky\.app\/config/i, error: /ERR_ABORTED/i },
  { url: /live-events\.workers\.bsky\.app\/config/i, error: /ERR_ABORTED/i },
  { url: /cdn\.bsky\.app\/img\/avatar_thumbnail\//i, error: /ERR_ABORTED/i },
  { url: /events\.bsky\.app\/t/i, error: /ERR_ABORTED/i },
  { url: /events\.bsky\.app\/gb\/api\/features\//i, error: /ERR_ABORTED/i },
  { url: /(?:video\.bsky\.app\/watch|video\.cdn\.bsky\.app\/hls)\/.*\/(?:(?:playlist|video)\.m3u8|.*\.ts|.*\.vtt)/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/chat\.bsky\.convo\.getLog/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/app\.bsky\.graph\.(?:muteActor|unmuteActor)/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/com\.atproto\.identity\.resolveHandle/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/app\.bsky\.feed\.getAuthorFeed/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/app\.bsky\.graph\.getSuggestedFollowsByActor/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/chat\.bsky\.convo\.getConvoAvailability/i, error: /ERR_ABORTED/i },
];

const ignoredHttpFailure = [
  { url: /c\.1password\.com\/richicons/i, status: 404 },
  { url: /\/xrpc\/app\.bsky\.graph\.getList\?/, status: 400 },
  { url: /\/xrpc\/app\.bsky\.feed\.getAuthorFeed\?/, status: 400 },
];

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

  const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

  const isIgnoredConsole = (entry) =>
    ignoredConsole.some((pattern) => pattern.test(entry.text || ''));

  const isIgnoredRequestFailure = (entry) =>
    ignoredRequestFailure.some(
      (rule) => rule.url.test(entry.url || '') && rule.error.test(entry.errorText || ''),
    );

  const isIgnoredHttpFailure = (entry) =>
    ignoredHttpFailure.some(
      (rule) => rule.url.test(entry.url || '') && (!rule.status || rule.status === entry.status),
    );

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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const buttonText = async (locator) => {
    const label = await locator.getAttribute('aria-label');
    if (label && label.trim()) {
      return label.trim();
    }
    const text = await locator.innerText().catch(() => '');
    return text.trim();
  };

  const dismissBlockingOverlays = async (page) => {
    const backdrop = page.locator('[aria-label*="click to close"]').last();
    if (await backdrop.count()) {
      await backdrop.click({ force: true, noWaitAfter: true }).catch(() => undefined);
      await wait(page, 400);
    }

    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
    if (await dialog.count()) {
      const close = dialog.getByRole('button', { name: /close/i }).last();
      if (await close.count()) {
        await close.click({ noWaitAfter: true }).catch(() => undefined);
        await wait(page, 400);
      }
      await page.keyboard.press('Escape').catch(() => undefined);
      await wait(page, 400);
    }
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
