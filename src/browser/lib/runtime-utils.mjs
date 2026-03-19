import fs from 'node:fs/promises';

const SYSTEM_GOOGLE_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
