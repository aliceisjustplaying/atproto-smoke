import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  setupDualBrowser,
  createDualStepHelpers,
  finalizeDualSummary,
} from "./lib/dual-browser.js";
import { createDualApiHelpers } from "./lib/dual-api.js";
import { createListHelpers } from "./lib/lists.js";
import { createSettingsHelpers } from "./lib/settings.js";
import { runDualScenario } from "./lib/dual-scenario.js";
import { createDualActions } from "./lib/dual-actions.js";
import {
  AVATAR_PNG_BASE64,
  createBaseSummary,
  errorMessage,
  sleep,
} from "./lib/runtime-utils.js";
import type { DualRunConfig, FlexibleRecord, Summary } from "../types.js";
import { createDualRunConfig } from "../config.js";

export const runDualFromConfig = async (
  config: DualRunConfig,
): Promise<Summary> => {
  await fs.mkdir(config.artifactsDir, { recursive: true });
  const appBaseUrl = config.appUrl.replace(/\/$/, "");

  const summary: Summary = createBaseSummary({
    appUrl: config.appUrl,
    pdsUrl: config.pdsUrl,
    primaryPdsUrl:
      typeof config.primary.pdsUrl === "string"
        ? config.primary.pdsUrl
        : config.pdsUrl,
    secondaryPdsUrl:
      typeof config.secondary.pdsUrl === "string"
        ? config.secondary.pdsUrl
        : config.pdsUrl,
    publicApiUrl: config.publicApiUrl,
    targetHandle: config.targetHandle,
    remoteReplyPostUrl: config.remoteReplyPostUrl,
    primaryHandle: config.primary.handle,
    secondaryHandle: config.secondary.handle,
  });

  if (config.accountSource !== undefined) {
    summary.notes.push(`account source: ${config.accountSource}`);
  }

  const { browser, primaryPage, secondaryPage } = await setupDualBrowser({
    config,
    summary,
  });
  const {
    screenshot,
    normalizeText,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
    step,
    wait,
    buttonText,
  } = createDualStepHelpers({ config, summary, primaryPage, secondaryPage });
  const {
    fetchJson,
    fetchStatus,
    xrpcJson,
    waitForOwnPostRecord,
    waitForFollowRecord,
    waitForNoOwnRecord,
    waitForOwnListRecord,
    waitForOwnListItemRecord,
    recordRkey,
    createSession,
    pollNotifications,
    prepareAccounts,
    cleanupStaleSmokeArtifacts,
  } = createDualApiHelpers({ config });
  const {
    openListPage,
    createList,
    editCurrentList,
    deleteCurrentList,
    addUserToCurrentList,
    removeUserFromCurrentList,
  } = createListHelpers({ appBaseUrl, wait });
  const { setCheckboxSetting, setRadioSetting } = createSettingsHelpers({
    appBaseUrl,
    wait,
  });

  const { primary, secondary } = prepareAccounts({
    primaryConfig: config.primary,
    secondaryConfig: config.secondary,
    startedAt: summary.startedAt,
  });

  const actions = createDualActions({
    config,
    summary,
    appBaseUrl,
    wait,
    sleep,
    normalizeText,
    buttonText,
    fetchJson,
    fetchStatus,
    xrpcJson,
    avatarPngBase64: AVATAR_PNG_BASE64,
  });

  try {
    await runDualScenario({
      config,
      step,
      primaryPage,
      secondaryPage,
      primary,
      secondary,
      createSession,
      cleanupStaleSmokeArtifacts,
      waitForOwnPostRecord,
      waitForFollowRecord,
      waitForNoOwnRecord,
      waitForOwnListRecord,
      waitForOwnListItemRecord,
      recordRkey,
      pollNotifications,
      createList,
      openListPage,
      editCurrentList,
      addUserToCurrentList,
      removeUserFromCurrentList,
      deleteCurrentList,
      setRadioSetting,
      setCheckboxSetting,
      ...actions,
    });
  } catch (error) {
    summary.fatal = errorMessage(error);
  }

  await finalizeDualSummary({
    summary,
    config,
    screenshot,
    browser,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
  });
  await fs.writeFile(
    path.join(config.artifactsDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
};

export const runDualFromConfigPath = async (
  configPath: string,
): Promise<Summary> => {
  const config = createDualRunConfig(
    JSON.parse(await fs.readFile(configPath, "utf8")) as FlexibleRecord,
  );
  return await runDualFromConfig(config);
};

export const runDualFromArgv = async (argv = process.argv): Promise<number> => {
  const configPath = argv[2];
  if (configPath === undefined) {
    process.stderr.write(
      "usage: node dist/src/browser/run-dual.js <config.json>\n",
    );
    return 2;
  }
  const summary = await runDualFromConfigPath(configPath);
  return summary.ok === true ? 0 : 1;
};

const isDirectExecution =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const exitCode = await runDualFromArgv(process.argv);
  process.exit(exitCode);
}
