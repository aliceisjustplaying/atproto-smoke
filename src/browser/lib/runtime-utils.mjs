import fs from 'node:fs/promises';

const SYSTEM_GOOGLE_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const AVATAR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAV0lEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6gWUC2gWkC1gGoB1QKqBVQLqBZQLaBaQLWAagHVAqoFVAuoFlAtoFpAtYBqAdUCqgVUC6gWUC2gWkD1B4a2AX/y3CvgAAAAAElFTkSuQmCC';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

export const createBaseSummary = (fields = {}) => ({
  startedAt: new Date().toISOString(),
  steps: [],
  console: [],
  pageErrors: [],
  requestFailures: [],
  httpFailures: [],
  xrpc: [],
  notes: [],
  ...fields,
});

export const recordStep = (summary, name, status, extra = {}) => {
  summary.steps.push({
    name,
    status,
    at: new Date().toISOString(),
    ...extra,
  });
};

export const createStepRunner = ({
  summary,
  emitProgress,
  captureArtifacts,
  defaultTimeoutMs,
}) => {
  return async (name, fn, { optional = false, timeoutMs, pageNames = [] } = {}) => {
    const effectiveTimeoutMs = Number(timeoutMs || defaultTimeoutMs || 0);
    emitProgress('start', name);
    let timeoutId;
    try {
      const result = effectiveTimeoutMs > 0
        ? await Promise.race([
            fn(),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`step timed out after ${effectiveTimeoutMs}ms`));
              }, effectiveTimeoutMs);
            }),
          ])
        : await fn();
      const artifacts = await captureArtifacts({ name, pageNames, failed: false });
      recordStep(summary, name, 'ok', { ...artifacts, ...(result ?? {}) });
      emitProgress('ok', name);
      return result;
    } catch (error) {
      const artifacts = await captureArtifacts({ name, pageNames, failed: true });
      recordStep(summary, name, optional ? 'skipped' : 'failed', {
        ...artifacts,
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
};

export const buildBrowserLaunchCandidates = async (config) => {
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
  if (!config.browserExecutablePath) {
    try {
      await fs.access(SYSTEM_GOOGLE_CHROME);
      candidates.push({
        label: 'system-google-chrome',
        options: { ...base, executablePath: SYSTEM_GOOGLE_CHROME },
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

export const fetchJsonWithTimeout = async (url, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchOptions = {
    ...options,
    signal: controller.signal,
  };
  delete fetchOptions.timeoutMs;
  let res;
  try {
    res = await fetch(url, fetchOptions);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
};

export const fetchStatusWithTimeout = async (url, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      redirect: options.redirect || 'follow',
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, url: res.url };
  } finally {
    clearTimeout(timer);
  }
};

export const buttonText = async (locator) => {
  const label = await locator.getAttribute('aria-label');
  if (label && label.trim()) {
    return label.trim();
  }
  const text = await locator.innerText().catch(() => '');
  return text.trim();
};

export const dismissBlockingOverlays = async (page) => {
  const backdrop = page.locator('[aria-label*="click to close"]').last();
  if (await backdrop.count()) {
    await backdrop.click({ force: true, noWaitAfter: true }).catch(() => undefined);
    await page.waitForTimeout(400);
  }

  const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
  if (await dialog.count()) {
    const close = dialog.getByRole('button', { name: /close/i }).last();
    if (await close.count()) {
      await close.click({ noWaitAfter: true }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(400);
  }
};

export const loginToBlueskyApp = async ({
  page,
  appUrl,
  pdsHost,
  loginIdentifier,
  password,
  notes,
  noteTarget,
}) => {
  let loginPath = 'legacy-service-picker';
  const activeScope = () => page.locator('[role="dialog"]').last();

  const clickNamedControl = async (name) => {
    const scope = activeScope();
    const asButton = scope.getByRole('button', { name }).first();
    if (await asButton.count()) {
      await asButton.click({ noWaitAfter: true, force: true });
      return;
    }
    const asLink = scope.getByRole('link', { name }).first();
    if (await asLink.count()) {
      await asLink.click({ noWaitAfter: true, force: true });
      return;
    }
    await scope.getByText(name).last().click({ noWaitAfter: true, force: true });
  };

  // The service picker dialog can animate an overlay layer over its own buttons.
  // Force-click the in-dialog choices so login is not gated on that transient layer.
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await clickNamedControl('Sign in');
  await page.waitForTimeout(1000);

  const loginIdentifierField = page.getByPlaceholder('Username or email address');
  if (await loginIdentifierField.count()) {
    const serviceButton = page.getByTestId('selectServiceButton').first();
    const currentService = await buttonText(serviceButton).catch(() => '');
    if (!(new RegExp(pdsHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).test(currentService)) {
      loginPath = 'inline-provider-switcher';
      await serviceButton.click({ noWaitAfter: true, force: true });
      await page.waitForTimeout(500);
      await clickNamedControl('Custom');
      await page.waitForTimeout(500);
      await page.getByPlaceholder('my-server.com').fill(pdsHost);
      await page.getByRole('button', { name: 'Done' }).click({ noWaitAfter: true });
      await page.waitForTimeout(500);
    } else {
      loginPath = 'inline-provider-already-selected';
    }
  } else {
    loginPath = 'legacy-service-picker';
    await clickNamedControl('Bluesky Social');
    await page.waitForTimeout(500);
    await clickNamedControl('Custom');
    await page.waitForTimeout(500);
    await page.getByPlaceholder('my-server.com').fill(pdsHost);
    await page.getByRole('button', { name: 'Done' }).click({ noWaitAfter: true });
    await page.waitForTimeout(500);
  }

  const close = page.getByRole('button', { name: 'Close welcome modal' });
  if (await close.count()) {
    await close.click({ noWaitAfter: true }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page.getByPlaceholder('Username or email address').fill(loginIdentifier);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByTestId('loginNextButton').click({ noWaitAfter: true });
  await page.waitForTimeout(3000);
  if (Array.isArray(notes)) {
    notes.push(`login path for ${noteTarget || pdsHost}: ${loginPath}`);
  }
  return { loginPath };
};

export const pollJsonUntil = async ({
  name,
  buildUrl,
  predicate,
  timeoutMs,
  fetchJson,
  intervalMs = 5000,
}) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fetchJson(buildUrl(), {
      timeoutMs: Math.min(timeoutMs, 30000),
    });
    if (predicate(last)) {
      return last;
    }
    await sleep(intervalMs);
  }
  throw new Error(`${name} did not succeed before timeout; last status=${last?.status ?? 'none'}`);
};

export const launchBrowserWithFallback = async ({ chromium, config, summary }) => {
  const errors = [];
  for (const candidate of await buildBrowserLaunchCandidates(config)) {
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

export const attachPageLogging = ({
  summary,
  page,
  pageName,
  xrpcLimit = 200,
}) => {
  const maybePage = pageName ? { page: pageName } : {};

  page.on('console', (msg) => {
    summary.console.push({
      ...maybePage,
      type: msg.type(),
      text: msg.text(),
    });
  });

  page.on('pageerror', (error) => {
    summary.pageErrors.push({
      ...maybePage,
      message: String(error?.message ?? error),
      stack: error?.stack,
    });
  });

  page.on('requestfailed', (req) => {
    summary.requestFailures.push({
      ...maybePage,
      url: req.url(),
      method: req.method(),
      errorText: req.failure()?.errorText ?? 'unknown',
    });
  });

  page.on('response', (res) => {
    const status = res.status();
    if (res.url().includes('/xrpc/')) {
      summary.xrpc.push({
        ...maybePage,
        url: res.url(),
        status,
        method: res.request().method(),
      });
      if (summary.xrpc.length > xrpcLimit) {
        summary.xrpc.shift();
      }
    }
    if (status >= 400) {
      summary.httpFailures.push({
        ...maybePage,
        url: res.url(),
        status,
        method: res.request().method(),
      });
    }
  });
};

export const createProgressEmitter = ({ enabled, write = console.error }) => {
  return (status, name, detail = '') => {
    if (!enabled) {
      return;
    }
    const timestamp = new Date().toISOString();
    const suffix = detail ? ` ${detail}` : '';
    write(`[${timestamp}] [${status}] ${name}${suffix}`);
  };
};

export const finalizeSummary = ({
  summary,
  strictErrors,
  isIgnoredConsole,
  isIgnoredRequestFailure,
  isIgnoredHttpFailure,
}) => {
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
  if (!summary.fatal && strictErrors !== false && summary.unexpected.total > 0) {
    summary.fatal = `Unexpected browser/runtime errors: ${summary.unexpected.total}`;
  }
  summary.ok = !summary.fatal;
  return summary;
};

export const closeBrowserSafely = async ({ browser, summary, timeoutMs = 15000 }) => {
  await Promise.race([
    browser.close(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`browser close timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).catch((error) => {
    summary.notes.push(String(error?.message ?? error));
  });
};
