import fs from "node:fs/promises";
import type { Browser, Locator, Page } from "playwright";
import { isRecord } from "../../guards.js";
import type {
  FetchJsonResult,
  FetchStatusResult,
  FlexibleRecord,
  Summary,
} from "../../types.js";
import type { StepOptions, StepRunner } from "./browser-types.js";

const SYSTEM_GOOGLE_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAV0lEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6gWUC2gWkC1gGoB1QKqBVQLqBZQLaBaQLWAagHVAqoFVAuoFlAtoFpAtYBqAdUCqgVUC6gWUC2gWkD1B4a2AX/y3CvgAAAAAElFTkSuQmCC";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeText = (text: string | null | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim();

export const createBaseSummary = (fields: FlexibleRecord = {}): Summary => ({
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

export const recordStep = (
  summary: Summary,
  name: string,
  status: string,
  extra: FlexibleRecord = {},
): void => {
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
}: {
  summary: Summary;
  emitProgress: (status: string, name: string, detail?: string) => void;
  captureArtifacts: (args: {
    name: string;
    pageNames?: string[];
    failed: boolean;
  }) => Promise<FlexibleRecord>;
  defaultTimeoutMs?: number;
}): StepRunner => {
  return async <T>(
    name: string,
    fn: () => Promise<T>,
    { optional = false, timeoutMs, pageNames = [] }: StepOptions = {},
  ): Promise<T | null> => {
    const effectiveTimeoutMs = timeoutMs ?? defaultTimeoutMs ?? 0;
    emitProgress("start", name);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result: T =
        effectiveTimeoutMs > 0
          ? await Promise.race<T>([
              fn(),
              new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                  reject(
                    new Error(
                      `step timed out after ${String(effectiveTimeoutMs)}ms`,
                    ),
                  );
                }, effectiveTimeoutMs);
              }),
            ])
          : await fn();
      const artifacts = await captureArtifacts({
        name,
        pageNames,
        failed: false,
      });
      const resultDetails = isRecord(result) ? result : {};
      recordStep(summary, name, "ok", {
        ...artifacts,
        ...resultDetails,
      });
      emitProgress("ok", name);
      return result;
    } catch (error) {
      const artifacts = await captureArtifacts({
        name,
        pageNames,
        failed: true,
      });
      recordStep(summary, name, optional ? "skipped" : "failed", {
        ...artifacts,
        error: errorMessage(error),
      });
      emitProgress(optional ? "skip" : "fail", name, errorMessage(error));
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

export const buildBrowserLaunchCandidates = async (config: {
  browserExecutablePath?: string;
  headless?: boolean;
}): Promise<{ label: string; options: FlexibleRecord }[]> => {
  const base = {
    headless: config.headless !== false,
    chromiumSandbox: true,
  };
  const candidates: { label: string; options: FlexibleRecord }[] = [];
  const browserExecutablePath = config.browserExecutablePath;
  if (browserExecutablePath !== undefined) {
    candidates.push({
      label: `executable:${browserExecutablePath}`,
      options: { ...base, executablePath: browserExecutablePath },
    });
  } else {
    try {
      await fs.access(SYSTEM_GOOGLE_CHROME);
      candidates.push({
        label: "system-google-chrome",
        options: { ...base, executablePath: SYSTEM_GOOGLE_CHROME },
      });
    } catch {
      // Fall back to Playwright-managed Chromium below.
    }
  }
  candidates.push({
    label: "playwright-chromium",
    options: { ...base, channel: "chromium" },
  });
  return candidates;
};

export const fetchJsonWithTimeout = async (
  url: string,
  options: FlexibleRecord = {},
): Promise<FetchJsonResult> => {
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const fetchOptions: RequestInit & { timeoutMs?: number } = {
    ...(isRecord(options) ? options : {}),
    signal: controller.signal,
  };
  delete fetchOptions.timeoutMs;
  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: FetchJsonResult["json"];
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    json =
      parsed === null || Array.isArray(parsed) || isRecord(parsed)
        ? parsed
        : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
};

export const fetchStatusWithTimeout = async (
  url: string,
  options: FlexibleRecord = {},
): Promise<FetchStatusResult> => {
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const redirect: RequestRedirect =
      options.redirect === "error" ||
      options.redirect === "manual" ||
      options.redirect === "follow"
        ? options.redirect
        : "follow";
    const res = await fetch(url, {
      ...(isRecord(options) ? options : {}),
      redirect,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, url: res.url };
  } finally {
    clearTimeout(timer);
  }
};

export const buttonText = async (locator: Locator): Promise<string> => {
  const label = await locator.getAttribute("aria-label");
  const trimmedLabel = label?.trim();
  if (trimmedLabel !== undefined && trimmedLabel.length > 0) {
    return trimmedLabel;
  }
  const text = await locator.innerText().catch(() => "");
  return text.trim();
};

export const dismissBlockingOverlays = async (page: Page): Promise<void> => {
  const backdrop = page.locator('[aria-label*="click to close"]').last();
  if ((await backdrop.count()) > 0) {
    await backdrop
      .click({ force: true, noWaitAfter: true })
      .catch(() => undefined);
    await page.waitForTimeout(400);
  }

  const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
  if ((await dialog.count()) > 0) {
    const close = dialog.getByRole("button", { name: /close/i }).last();
    if ((await close.count()) > 0) {
      await close.click({ noWaitAfter: true }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
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
}: {
  page: Page;
  appUrl: string;
  pdsHost: string;
  loginIdentifier: string;
  password: string;
  notes?: string[];
  noteTarget?: string;
}): Promise<{ loginPath: string }> => {
  let loginPath = "legacy-service-picker";
  const activeScope = (): Locator => page.locator('[role="dialog"]').last();

  const clickNamedControl = async (name: string): Promise<void> => {
    const scope = activeScope();
    const asButton = scope.getByRole("button", { name }).first();
    if ((await asButton.count()) > 0) {
      await asButton.click({ noWaitAfter: true, force: true });
      return;
    }
    const asLink = scope.getByRole("link", { name }).first();
    if ((await asLink.count()) > 0) {
      await asLink.click({ noWaitAfter: true, force: true });
      return;
    }
    await scope
      .getByText(name)
      .last()
      .click({ noWaitAfter: true, force: true });
  };

  // The service picker dialog can animate an overlay layer over its own buttons.
  // Force-click the in-dialog choices so login is not gated on that transient layer.
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await clickNamedControl("Sign in");
  await page.waitForTimeout(1000);

  const loginIdentifierField = page.getByPlaceholder(
    "Username or email address",
  );
  if ((await loginIdentifierField.count()) > 0) {
    const serviceButton = page.getByTestId("selectServiceButton").first();
    const currentService = await buttonText(serviceButton).catch(() => "");
    if (
      !new RegExp(pdsHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
        currentService,
      )
    ) {
      loginPath = "inline-provider-switcher";
      await serviceButton.click({ noWaitAfter: true, force: true });
      await page.waitForTimeout(500);
      await clickNamedControl("Custom");
      await page.waitForTimeout(500);
      await page.getByPlaceholder("my-server.com").fill(pdsHost);
      await page
        .getByRole("button", { name: "Done" })
        .click({ noWaitAfter: true });
      await page.waitForTimeout(500);
    } else {
      loginPath = "inline-provider-already-selected";
    }
  } else {
    loginPath = "legacy-service-picker";
    await clickNamedControl("Bluesky Social");
    await page.waitForTimeout(500);
    await clickNamedControl("Custom");
    await page.waitForTimeout(500);
    await page.getByPlaceholder("my-server.com").fill(pdsHost);
    await page
      .getByRole("button", { name: "Done" })
      .click({ noWaitAfter: true });
    await page.waitForTimeout(500);
  }

  const close = page.getByRole("button", { name: "Close welcome modal" });
  if ((await close.count()) > 0) {
    await close.click({ noWaitAfter: true }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page
    .getByPlaceholder("Username or email address")
    .fill(loginIdentifier);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByTestId("loginNextButton").click({ noWaitAfter: true });
  await page.waitForTimeout(3000);
  if (Array.isArray(notes)) {
    notes.push(`login path for ${noteTarget ?? pdsHost}: ${loginPath}`);
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
}: {
  name: string;
  buildUrl: () => string;
  predicate: (result: FetchJsonResult) => boolean;
  timeoutMs: number;
  fetchJson: (
    url: string,
    options?: FlexibleRecord,
  ) => Promise<FetchJsonResult>;
  intervalMs?: number;
}): Promise<FetchJsonResult> => {
  const started = Date.now();
  let last: FetchJsonResult | undefined;
  while (Date.now() - started < timeoutMs) {
    last = await fetchJson(buildUrl(), {
      timeoutMs: Math.min(timeoutMs, 30000),
    });
    if (predicate(last)) {
      return last;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `${name} did not succeed before timeout; last status=${String(last?.status ?? "none")}`,
  );
};

export const launchBrowserWithFallback = async ({
  chromium,
  config,
  summary,
}: {
  chromium: { launch: (options: FlexibleRecord) => Promise<Browser> };
  config: { browserExecutablePath?: string; headless?: boolean };
  summary: Summary;
}): Promise<Browser> => {
  const errors: string[] = [];
  for (const candidate of await buildBrowserLaunchCandidates(config)) {
    try {
      const browser = await chromium.launch(candidate.options);
      summary.notes.push(
        `browser launch candidate succeeded: ${candidate.label}`,
      );
      return browser;
    } catch (error) {
      errors.push(`${candidate.label}: ${errorMessage(error)}`);
    }
  }
  throw new Error(
    `unable to launch browser via any candidate: ${errors.join(" | ")}`,
  );
};

export const attachPageLogging = ({
  summary,
  page,
  pageName,
  xrpcLimit = 200,
}: {
  summary: Summary;
  page: Page;
  pageName?: string;
  xrpcLimit?: number;
}): void => {
  const maybePage = pageName !== undefined ? { page: pageName } : {};

  page.on("console", (msg) => {
    summary.console.push({
      ...maybePage,
      type: msg.type(),
      text: msg.text(),
    });
  });

  page.on("pageerror", (error) => {
    summary.pageErrors.push({
      ...maybePage,
      message: error.message,
      stack: error.stack,
    });
  });

  page.on("requestfailed", (req) => {
    summary.requestFailures.push({
      ...maybePage,
      url: req.url(),
      method: req.method(),
      errorText: req.failure()?.errorText ?? "unknown",
    });
  });

  page.on("response", (res) => {
    const status = res.status();
    if (res.url().includes("/xrpc/")) {
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

export const createProgressEmitter = ({
  enabled,
  write = (message: string): void => {
    process.stderr.write(`${message}\n`);
  },
}: {
  enabled: boolean;
  write?: (message: string) => void;
}): ((status: string, name: string, detail?: string) => void) => {
  return (status: string, name: string, detail = ""): void => {
    if (!enabled) {
      return;
    }
    const timestamp = new Date().toISOString();
    const suffix = detail ? ` ${detail}` : "";
    write(`[${timestamp}] [${status}] ${name}${suffix}`);
  };
};

export const finalizeSummary = ({
  summary,
  strictErrors,
  isIgnoredConsole,
  isIgnoredRequestFailure,
  isIgnoredHttpFailure,
}: {
  summary: Summary;
  strictErrors: boolean;
  isIgnoredConsole: (entry: Summary["console"][number]) => boolean;
  isIgnoredRequestFailure: (
    entry: Summary["requestFailures"][number],
  ) => boolean;
  isIgnoredHttpFailure: (entry: Summary["httpFailures"][number]) => boolean;
}): Summary => {
  summary.finishedAt = new Date().toISOString();
  summary.unexpected = {
    console: summary.console.filter((entry) => !isIgnoredConsole(entry)),
    requestFailures: summary.requestFailures.filter(
      (entry) => !isIgnoredRequestFailure(entry),
    ),
    httpFailures: summary.httpFailures.filter(
      (entry) => !isIgnoredHttpFailure(entry),
    ),
    pageErrors: summary.pageErrors,
  };
  summary.unexpected.total =
    summary.unexpected.console.length +
    summary.unexpected.requestFailures.length +
    summary.unexpected.httpFailures.length +
    summary.unexpected.pageErrors.length;
  if (
    summary.fatal === undefined &&
    strictErrors &&
    summary.unexpected.total > 0
  ) {
    summary.fatal = `Unexpected browser/runtime errors: ${String(summary.unexpected.total)}`;
  }
  summary.ok = summary.fatal === undefined;
  return summary;
};

export const closeBrowserSafely = async ({
  browser,
  summary,
  timeoutMs = 15000,
}: {
  browser: Browser;
  summary: Summary;
  timeoutMs?: number;
}): Promise<void> => {
  await Promise.race([
    browser.close(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`browser close timed out after ${String(timeoutMs)}ms`),
        );
      }, timeoutMs);
    }),
  ]).catch((error: unknown) => {
    summary.notes.push(errorMessage(error));
  });
};
