import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./lib/playwright-runtime.js";
import {
  AVATAR_PNG_BASE64,
  attachPageLogging,
  buttonText,
  closeBrowserSafely,
  createBaseSummary,
  createProgressEmitter,
  createStepRunner,
  fetchJsonWithTimeout,
  fetchStatusWithTimeout,
  finalizeSummary,
  launchBrowserWithFallback,
  normalizeText,
  pollJsonUntil,
  sleep,
  errorMessage,
} from "./lib/runtime-utils.js";
import {
  isIgnoredConsoleEntry,
  isIgnoredHttpFailureEntry,
  isIgnoredRequestFailureEntry,
} from "./lib/failure-rules.js";
import { runSingleScenario } from "./lib/single-scenario.js";
import { createSingleActions } from "./lib/single-actions.js";
import type {
  FetchJsonResult,
  FetchStatusResult,
  FlexibleRecord,
  SingleRunConfig,
  Summary,
} from "../types.js";
import { createSingleRunConfig } from "../config.js";

export const runSingleFromConfig = async (
  config: SingleRunConfig,
): Promise<Summary> => {
  await fs.mkdir(config.artifactsDir, { recursive: true });
  const appBaseUrl = config.appUrl.replace(/\/$/, "");

  const summary: Summary = createBaseSummary({
    appUrl: config.appUrl,
    pdsUrl: config.pdsUrl,
    publicApiUrl: config.publicApiUrl,
    handle: config.handle,
    loginIdentifier: config.loginIdentifier,
    targetHandle: config.targetHandle,
  });

  const progressEnabled = config.progress !== false;
  const emitProgress = createProgressEmitter({ enabled: progressEnabled });

  const browser = await launchBrowserWithFallback({
    chromium,
    config,
    summary,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  if (config.browserExecutablePath) {
    summary.notes.push(
      `requested browser executable: ${config.browserExecutablePath}`,
    );
  }

  attachPageLogging({ summary, page, xrpcLimit: 200 });

  const screenshot = async (name: string): Promise<string> => {
    const file = path.join(config.artifactsDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  };

  const step = createStepRunner({
    summary,
    emitProgress,
    captureArtifacts: async ({ name, failed }) => ({
      screenshot: await screenshot(failed ? `${name}-error` : name).catch(
        () => undefined,
      ),
    }),
  });

  const wait = (ms: number): Promise<void> => page.waitForTimeout(ms);
  const fetchJson = (
    url: string,
    options: FlexibleRecord = {},
  ): Promise<FetchJsonResult> =>
    fetchJsonWithTimeout(url, {
      headers: { accept: "application/json" },
      timeoutMs:
        typeof options.timeoutMs === "number" ? options.timeoutMs : 30000,
    });

  const fetchStatus = (
    url: string,
    options: FlexibleRecord = {},
  ): Promise<FetchStatusResult> =>
    fetchStatusWithTimeout(url, {
      timeoutMs:
        typeof options.timeoutMs === "number" ? options.timeoutMs : 30000,
    });

  const pollJson = (
    name: string,
    buildUrl: () => string,
    predicate: (result: FetchJsonResult) => boolean,
    timeoutMs: number,
  ): Promise<FetchJsonResult> =>
    pollJsonUntil({
      name,
      buildUrl,
      predicate,
      timeoutMs,
      fetchJson,
    });

  const actions = createSingleActions({
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
      page,
      ...actions,
    });
  } catch (error) {
    summary.fatal = errorMessage(error);
  }

  finalizeSummary({
    summary,
    strictErrors: config.strictErrors,
    isIgnoredConsole: isIgnoredConsoleEntry,
    isIgnoredRequestFailure: isIgnoredRequestFailureEntry,
    isIgnoredHttpFailure: isIgnoredHttpFailureEntry,
  });
  await screenshot("final").catch(() => undefined);
  await fs.writeFile(
    path.join(config.artifactsDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
  await closeBrowserSafely({ browser, summary });
  return summary;
};

export const runSingleFromConfigPath = async (
  configPath: string,
): Promise<Summary> => {
  const config = createSingleRunConfig(
    JSON.parse(await fs.readFile(configPath, "utf8")) as FlexibleRecord,
  );
  return runSingleFromConfig(config);
};

export const runSingleFromArgv = async (argv = process.argv): Promise<number> => {
  const configPath = argv[2];
  if (!configPath) {
    console.error("usage: node dist/src/browser/run-single.js <config.json>");
    return 2;
  }
  const summary = await runSingleFromConfigPath(configPath);
  return summary.ok ? 0 : 1;
};

const isDirectExecution =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const exitCode = await runSingleFromArgv(process.argv);
  process.exit(exitCode);
}
