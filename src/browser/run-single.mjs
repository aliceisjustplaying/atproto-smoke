import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './lib/playwright-runtime.mjs';
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
    targetHandle: config.targetHandle,
    steps: [],
    console: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
    xrpc: [],
    notes: [],
  };

  const ignoredConsole = [
  /events\.bsky\.app\/.*ERR_BLOCKED_BY_CLIENT/i,
  /slider-vertical/i,
  /Password field is not contained in a form/i,
];

  const ignoredRequestFailure = [
  { url: /events\.bsky\.app\//i, error: /ERR_(BLOCKED_BY_CLIENT|ABORTED)/i },
  { url: /workers\.dev\/api\/config/i, error: /ERR_ABORTED/i },
  { url: /app-config\.workers\.bsky\.app\/config/i, error: /ERR_ABORTED/i },
  { url: /live-events\.workers\.bsky\.app\/config/i, error: /ERR_ABORTED/i },
  { url: /cdn\.bsky\.app\/img\/avatar_thumbnail\//i, error: /ERR_ABORTED/i },
  { url: /events\.bsky\.app\/t/i, error: /ERR_ABORTED/i },
  { url: /events\.bsky\.app\/gb\/api\/features\//i, error: /ERR_ABORTED/i },
  { url: /(?:video\.bsky\.app\/watch|video\.cdn\.bsky\.app\/hls)\/.*\/(?:(?:playlist|video)\.m3u8|.*\.ts)/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/chat\.bsky\.convo\.getLog/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/com\.atproto\.identity\.resolveHandle/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/app\.bsky\.feed\.getAuthorFeed/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/app\.bsky\.graph\.getSuggestedFollowsByActor/i, error: /ERR_ABORTED/i },
  { url: /\/xrpc\/chat\.bsky\.convo\.getConvoAvailability/i, error: /ERR_ABORTED/i },
];

  const ignoredHttpFailure = [
  { url: /c\.1password\.com\/richicons/i, status: 404 },
  { url: /\/xrpc\/app\.bsky\.feed\.getAuthorFeed\?/, status: 400 },
];
  const progressEnabled = config.progress !== false;

  const emitProgress = (status, name, detail = '') => {
  if (!progressEnabled) {
    return;
  }
  const timestamp = new Date().toISOString();
  const suffix = detail ? ` ${detail}` : '';
  console.error(`[${timestamp}] [${status}] ${name}${suffix}`);
  };

  const AVATAR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAV0lEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6gWUC2gWkC1gGoB1QKqBVQLqBZQLaBaQLWAagHVAqoFVAuoFlAtoFpAtYBqAdUCqgVUC6gWUC2gWkD1B4a2AX/y3CvgAAAAAElFTkSuQmCC';

  const browserCandidates = async () => {
  const base = {
    headless: config.headless !== false,
    chromiumSandbox: true,
  };
  const candidates = [];
  if (config.browserExecutablePath) {
    candidates.push({
      label: `executable:${config.browserExecutablePath}`,
      options: { ...base, executablePath: config.browserExecutablePath },
    });
  }
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!config.browserExecutablePath) {
    try {
      await fs.access(systemChrome);
      candidates.push({
        label: 'system-google-chrome',
        options: { ...base, executablePath: systemChrome },
      });
    } catch {
      // Fall back to Playwright-managed Chromium below.
    }
  }
  candidates.push({
    label: 'playwright-chromium',
    options: { ...base, channel: 'chromium' },
  });
  return candidates;
};

  const launchBrowser = async () => {
  const errors = [];
  for (const candidate of await browserCandidates()) {
    try {
      const browser = await chromium.launch(candidate.options);
      summary.notes.push(`browser launch candidate succeeded: ${candidate.label}`);
      return browser;
    } catch (error) {
      errors.push(`${candidate.label}: ${String(error?.message ?? error)}`);
    }
  }
  throw new Error(`unable to launch browser via any candidate: ${errors.join(' | ')}`);
};

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  if (config.browserExecutablePath) {
    summary.notes.push(`requested browser executable: ${config.browserExecutablePath}`);
  }

  page.on('console', (msg) => {
    summary.console.push({
      type: msg.type(),
      text: msg.text(),
    });
  });

  page.on('pageerror', (error) => {
    summary.pageErrors.push({
      message: String(error?.message ?? error),
      stack: error?.stack,
    });
  });

  page.on('requestfailed', (req) => {
    summary.requestFailures.push({
      url: req.url(),
      method: req.method(),
      errorText: req.failure()?.errorText ?? 'unknown',
    });
  });

  page.on('response', (res) => {
    const status = res.status();
    if (res.url().includes('/xrpc/')) {
      summary.xrpc.push({
        url: res.url(),
        status,
        method: res.request().method(),
      });
      if (summary.xrpc.length > 200) {
        summary.xrpc.shift();
      }
    }
    if (status >= 400) {
      summary.httpFailures.push({
        url: res.url(),
        status,
        method: res.request().method(),
      });
    }
  });

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

  const fetchJson = async (url) => {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
  };

  const fetchStatus = async (url) => {
  const res = await fetch(url, {
    redirect: 'follow',
  });
  return { ok: res.ok, status: res.status, url: res.url };
  };

  const pollJson = async (name, buildUrl, predicate, timeoutMs) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fetchJson(buildUrl());
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

  summary.finishedAt = new Date().toISOString();
  summary.unexpected = {
    console: summary.console.filter((entry) => !isIgnoredConsole(entry)),
    requestFailures: summary.requestFailures.filter((entry) => !isIgnoredRequestFailure(entry)),
    httpFailures: summary.httpFailures.filter((entry) => !isIgnoredHttpFailure(entry)),
    pageErrors: summary.pageErrors,
  };
  summary.unexpected.total =
    summary.unexpected.console.length +
    summary.unexpected.requestFailures.length +
    summary.unexpected.httpFailures.length +
    summary.unexpected.pageErrors.length;
  if (!summary.fatal && config.strictErrors !== false && summary.unexpected.total > 0) {
    summary.fatal = `Unexpected browser/runtime errors: ${summary.unexpected.total}`;
  }
  summary.ok = !summary.fatal;
  await screenshot('final').catch(() => undefined);
  await fs.writeFile(
    path.join(config.artifactsDir, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );
  console.log(JSON.stringify(summary, null, 2));
  await Promise.race([
    browser.close(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('browser close timed out after 15000ms')), 15000);
    }),
  ]).catch((error) => {
    summary.notes.push(String(error?.message ?? error));
  });
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
