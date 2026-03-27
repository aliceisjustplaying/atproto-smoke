import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './lib/playwright-runtime.mjs';
import {
  attachPageLogging,
  buttonText,
  closeBrowserSafely,
  createProgressEmitter,
  fetchJsonWithTimeout,
  fetchStatusWithTimeout,
  finalizeSummary,
  launchBrowserWithFallback,
} from './lib/runtime-utils.mjs';
import {
  isIgnoredConsoleEntry,
  isIgnoredHttpFailureEntry,
  isIgnoredRequestFailureEntry,
} from './lib/failure-rules.mjs';
import { runSingleScenario } from './lib/single-scenario.mjs';
import { createSingleActions } from './lib/single-actions.mjs';

export const runSingleFromConfig = async (config) => {
  await fs.mkdir(config.artifactsDir, { recursive: true });
  const appBaseUrl = config.appUrl.replace(/\/$/, '');

  const summary = {
    startedAt: new Date().toISOString(),
    appUrl: config.appUrl,
    pdsUrl: config.pdsUrl,
    publicApiUrl: config.publicApiUrl,
    handle: config.handle,
    loginIdentifier: config.loginIdentifier,
    targetHandle: config.targetHandle,
    steps: [],
    console: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
    xrpc: [],
    notes: [],
  };

  const progressEnabled = config.progress !== false;
  const emitProgress = createProgressEmitter({ enabled: progressEnabled });

  const AVATAR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAV0lEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6gWUC2gWkC1gGoB1QKqBVQLqBZQLaBaQLWAagHVAqoFVAuoFlAtoFpAtYBqAdUCqgVUC6gWUC2gWkD1B4a2AX/y3CvgAAAAAElFTkSuQmCC';

  const browser = await launchBrowserWithFallback({ chromium, config, summary });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  if (config.browserExecutablePath) {
    summary.notes.push(`requested browser executable: ${config.browserExecutablePath}`);
  }

  attachPageLogging({ summary, page, xrpcLimit: 200 });

  const screenshot = async (name) => {
    const file = path.join(config.artifactsDir, `${name}.png`);
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

  const isIgnoredConsole = isIgnoredConsoleEntry;
  const isIgnoredRequestFailure = isIgnoredRequestFailureEntry;
  const isIgnoredHttpFailure = isIgnoredHttpFailureEntry;

  const step = async (name, fn, { optional = false } = {}) => {
  emitProgress('start', name);
  try {
    const result = await fn();
    const shot = await screenshot(name);
    recordStep(name, 'ok', { screenshot: shot, ...(result ?? {}) });
    emitProgress('ok', name);
    return result;
  } catch (error) {
    const shot = await screenshot(`${name}-error`).catch(() => undefined);
    recordStep(name, optional ? 'skipped' : 'failed', {
      screenshot: shot,
      error: String(error?.message ?? error),
    });
    emitProgress(optional ? 'skip' : 'fail', name, String(error?.message ?? error));
    if (!optional) {
      throw error;
    }
    return null;
  }
  };

  const wait = (ms) => page.waitForTimeout(ms);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchJson = async (url, timeoutMs = 30000) =>
    fetchJsonWithTimeout(url, {
      headers: { accept: 'application/json' },
      timeoutMs,
    });

  const fetchStatus = async (url, timeoutMs = 30000) =>
    fetchStatusWithTimeout(url, {
      timeoutMs,
    });

  const pollJson = async (name, buildUrl, predicate, timeoutMs) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fetchJson(buildUrl(), Math.min(timeoutMs, 30000));
    if (predicate(last)) {
      return last;
    }
    await sleep(5000);
  }
  throw new Error(`${name} did not succeed before timeout; last status=${last?.status ?? 'none'}`);
  };

const {
  login,
  completeAgeAssuranceIfNeeded,
  gotoProfile,
  maybeFollowTarget,
  composePost,
  waitForProfileHandle,
  findRowByPrimaryText,
  findFirstFeedItem,
  clickQuote,
  clickReply,
  ensureBookmarked,
  ensureNotBookmarked,
  ensureLiked,
  ensureNotLiked,
  ensureReposted,
  ensureNotReposted,
  openProfileTab,
  maybeUnfollowTarget,
  maybeDeleteOwnPostByText,
  openNotifications,
  openSavedPosts,
  verifyPublicHandleResolution,
  verifyPublicAuthorFeed,
  verifyPublicProfile,
  verifyPublicProfileAfterEdit,
  verifyLocalProfileAfterEdit,
  editProfile,
} = createSingleActions({
  config,
  summary,
  page,
  appBaseUrl,
  wait,
  sleep,
  normalizeText,
  buttonText,
  fetchStatus,
  pollJson,
  avatarPngBase64: AVATAR_PNG_BASE64,
});

  try {
    await runSingleScenario({
    step,
    config,
    login,
    completeAgeAssuranceIfNeeded,
    composePost,
    verifyPublicHandleResolution,
    verifyPublicProfile,
    verifyPublicAuthorFeed,
    gotoProfile,
    page,
    findRowByPrimaryText,
    ensureLiked,
    ensureReposted,
    clickQuote,
    clickReply,
    ensureNotLiked,
    ensureNotReposted,
    maybeFollowTarget,
    findFirstFeedItem,
    ensureBookmarked,
    openSavedPosts,
    ensureNotBookmarked,
    maybeUnfollowTarget,
    openNotifications,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
    openProfileTab,
    maybeDeleteOwnPostByText,
    });
  } catch (error) {
    summary.fatal = String(error?.message ?? error);
  }

  finalizeSummary({
    summary,
    strictErrors: config.strictErrors,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
  });
  await screenshot('final').catch(() => undefined);
  await fs.writeFile(
    path.join(config.artifactsDir, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );
  console.log(JSON.stringify(summary, null, 2));
  await closeBrowserSafely({ browser, summary });
  return summary;
};

export const runSingleFromConfigPath = async (configPath) => {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  return runSingleFromConfig(config);
};

export const runSingleFromArgv = async (argv = process.argv) => {
  const configPath = argv[2];
  if (!configPath) {
    console.error('usage: node run-single.mjs <config.json>');
    return 2;
  }
  const summary = await runSingleFromConfigPath(configPath);
  return summary.ok ? 0 : 1;
};

const isDirectExecution =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const exitCode = await runSingleFromArgv(process.argv);
  process.exitCode = exitCode;
}
