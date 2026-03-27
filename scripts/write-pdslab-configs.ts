#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorMessage } from "../src/browser/lib/runtime-utils.js";
import {
  getRecord,
  getString,
  getUnknown,
  parseJsonRecord,
} from "../src/guards.js";
import { PDSLAB_TARGETS } from "../src/lab/pdslab-targets.js";
import type { FlexibleRecord } from "../src/types.js";

type PdslabTargetSpec = (typeof PDSLAB_TARGETS)[number];

interface PlanTarget {
  id: string;
  mode: string;
  runnerStatus: string;
  config: FlexibleRecord;
}

interface SkippedTarget {
  id: string;
  mode: string;
  runnerStatus: string;
  notes: unknown;
}

interface Plan {
  generatedAt: string;
  domain: unknown;
  runnableTargets: PlanTarget[];
  skippedTargets: SkippedTarget[];
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const parseArgs = (
  argv: string[],
): { ledgerPath: string; outputDir: string; help?: boolean } => {
  const result: { ledgerPath: string; outputDir: string; help?: boolean } = {
    ledgerPath: path.join(repoRoot, ".tmp", "smoke-accounts.local.json"),
    outputDir: path.join(repoRoot, ".tmp", "generated", "pdslab-configs"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ledger") {
      result.ledgerPath = path.resolve(argv[++i]);
      continue;
    }
    if (arg === "--output-dir") {
      result.outputDir = path.resolve(argv[++i]);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return result;
};

const usage = `Usage:
  bun run write:pdslab-configs [--ledger .tmp/smoke-accounts.local.json] [--output-dir .tmp/generated/pdslab-configs]
`;

const readJson = async (filePath: string): Promise<FlexibleRecord> =>
  parseJsonRecord(await fs.readFile(filePath, "utf8"), filePath);

const ensureTarget = (
  ledger: FlexibleRecord,
  targetId: string,
): FlexibleRecord => {
  const targets = getRecord(ledger.targets);
  const target = getRecord(targets?.[targetId]);
  if (target === undefined) {
    throw new Error(`ledger target missing: ${targetId}`);
  }
  return target;
};

const requiredAccountString = (
  account: FlexibleRecord,
  key: "handle" | "password" | "did",
): string => {
  const value = getString(account, key);
  if (value === undefined) {
    throw new Error(`account is missing required ${key}`);
  }
  return value;
};

const createAccountDefaults = (
  specId: string,
  role: string,
): FlexibleRecord => {
  const prefix = `pdslab ${specId} ${role}`;
  return {
    postText: `${prefix} root post`,
    mediaPostText: `${prefix} image post`,
    quoteText: `${prefix} quote post`,
    replyText: `${prefix} reply post`,
    profileNote: `${prefix} profile note`,
    cleanupPostPrefixes: [`${prefix} `],
  };
};

const createAccount = ({
  account,
  loginIdentifierKey,
  specId,
  role,
}: {
  account: FlexibleRecord;
  loginIdentifierKey?: string;
  specId: string;
  role: string;
}): FlexibleRecord => {
  const normalized: FlexibleRecord = {
    ...createAccountDefaults(specId, role),
    handle: requiredAccountString(account, "handle"),
    password: requiredAccountString(account, "password"),
  };

  if (loginIdentifierKey !== undefined) {
    const loginIdentifier = getString(account, loginIdentifierKey);
    if (loginIdentifier === undefined || loginIdentifier.length === 0) {
      throw new Error(
        `missing loginIdentifierKey "${loginIdentifierKey}" on account`,
      );
    }
    normalized.loginIdentifier = loginIdentifier;
  }

  const did = getString(account, "did");
  if (did !== undefined) {
    normalized.did = did;
  }
  const email = getString(account, "email");
  if (email !== undefined) {
    normalized.email = email;
  }
  const pdsUrl = getString(account, "pdsUrl");
  if (pdsUrl !== undefined) {
    normalized.pdsUrl = pdsUrl;
  }
  const pdsHost = getString(account, "pdsHost");
  if (pdsHost !== undefined) {
    normalized.pdsHost = pdsHost;
  }

  return normalized;
};

const createSingleConfig = ({
  spec,
  ledgerTarget,
}: {
  spec: PdslabTargetSpec;
  ledgerTarget: FlexibleRecord;
}): FlexibleRecord => {
  const currentDeploymentKey =
    "currentDeploymentKey" in spec &&
    typeof spec.currentDeploymentKey === "string"
      ? spec.currentDeploymentKey
      : undefined;
  const ledgerAccount =
    "ledgerAccount" in spec && typeof spec.ledgerAccount === "string"
      ? spec.ledgerAccount
      : undefined;
  const accountSource =
    currentDeploymentKey !== undefined
      ? getUnknown(ledgerTarget, currentDeploymentKey)
      : getRecord(ledgerTarget.accounts)?.[ledgerAccount ?? ""];
  const normalizedAccountSource = getRecord(accountSource);
  const specAccountSource =
    "accountSource" in spec ? spec.accountSource : undefined;
  const specPairGroup = "pairGroup" in spec ? spec.pairGroup : undefined;

  if (normalizedAccountSource === undefined) {
    throw new Error(
      `single target ${spec.id} is missing its account in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: getUnknown(ledgerTarget, "pdsUrl"),
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    targetHandle: "smoke-a.perlsky.pdslab.net",
    accountSource: specAccountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabPairGroup: specPairGroup,
    pdslabNotes: spec.notes,
    account: createAccount({
      account: normalizedAccountSource,
      loginIdentifierKey:
        "loginIdentifierKey" in spec &&
        typeof spec.loginIdentifierKey === "string"
          ? spec.loginIdentifierKey
          : undefined,
      specId: spec.id,
      role: ledgerAccount ?? "single",
    }),
  };
};

const createDualConfig = ({
  spec,
  ledgerTarget,
}: {
  spec: PdslabTargetSpec;
  ledgerTarget: FlexibleRecord;
}): FlexibleRecord => {
  const accounts = getRecord(ledgerTarget.accounts);
  const primary = getRecord(accounts?.["smoke-a"]);
  const secondary = getRecord(accounts?.["smoke-b"]);
  const specAccountSource =
    "accountSource" in spec ? spec.accountSource : undefined;
  if (primary === undefined || secondary === undefined) {
    throw new Error(
      `dual target ${spec.id} is missing smoke-a or smoke-b in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: getUnknown(ledgerTarget, "pdsUrl"),
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    accountSource: specAccountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabNotes: spec.notes,
    primary: createAccount({
      account: primary,
      specId: spec.id,
      role: "primary",
    }),
    secondary: createAccount({
      account: secondary,
      specId: spec.id,
      role: "secondary",
    }),
  };
};

const createCrossPdsDualConfig = ({
  spec,
  primaryLedgerTarget,
  secondaryLedgerTarget,
}: {
  spec: PdslabTargetSpec;
  primaryLedgerTarget: FlexibleRecord;
  secondaryLedgerTarget: FlexibleRecord;
}): FlexibleRecord => {
  const primarySource =
    "primaryCurrentDeploymentKey" in spec &&
    typeof spec.primaryCurrentDeploymentKey === "string"
      ? getUnknown(primaryLedgerTarget, spec.primaryCurrentDeploymentKey)
      : getRecord(primaryLedgerTarget.accounts)?.[
          "primaryLedgerAccount" in spec &&
          typeof spec.primaryLedgerAccount === "string"
            ? spec.primaryLedgerAccount
            : ""
        ];
  const secondarySource =
    "secondaryCurrentDeploymentKey" in spec &&
    typeof spec.secondaryCurrentDeploymentKey === "string"
      ? getUnknown(secondaryLedgerTarget, spec.secondaryCurrentDeploymentKey)
      : getRecord(secondaryLedgerTarget.accounts)?.[
          "secondaryLedgerAccount" in spec &&
          typeof spec.secondaryLedgerAccount === "string"
            ? spec.secondaryLedgerAccount
            : ""
        ];

  const normalizedPrimarySource = getRecord(primarySource);
  const normalizedSecondarySource = getRecord(secondarySource);
  const specAccountSource =
    "accountSource" in spec ? spec.accountSource : undefined;
  if (
    normalizedPrimarySource === undefined ||
    normalizedSecondarySource === undefined
  ) {
    throw new Error(
      `cross-PDS target ${spec.id} is missing one of its accounts in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: getUnknown(primaryLedgerTarget, "pdsUrl"),
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    accountSource: specAccountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabNotes: spec.notes,
    primary: createAccount({
      account: {
        ...normalizedPrimarySource,
        pdsUrl: getUnknown(primaryLedgerTarget, "pdsUrl"),
      },
      loginIdentifierKey:
        "primaryLoginIdentifierKey" in spec &&
        typeof spec.primaryLoginIdentifierKey === "string"
          ? spec.primaryLoginIdentifierKey
          : undefined,
      specId: spec.id,
      role: "primary",
    }),
    secondary: createAccount({
      account: {
        ...normalizedSecondarySource,
        pdsUrl: getUnknown(secondaryLedgerTarget, "pdsUrl"),
      },
      loginIdentifierKey:
        "secondaryLoginIdentifierKey" in spec &&
        typeof spec.secondaryLoginIdentifierKey === "string"
          ? spec.secondaryLoginIdentifierKey
          : undefined,
      specId: spec.id,
      role: "secondary",
    }),
  };
};

const createPlan = (ledger: FlexibleRecord): Plan => {
  const targets: PlanTarget[] = [];
  const skipped: SkippedTarget[] = [];

  for (const spec of PDSLAB_TARGETS) {
    const specId = spec.id;
    const specMode = spec.mode;
    const specRunnerStatus = spec.runnerStatus;
    const ledgerTarget =
      "ledgerTarget" in spec && typeof spec.ledgerTarget === "string"
        ? ensureTarget(ledger, spec.ledgerTarget)
        : undefined;
    const primaryLedgerTarget =
      "primaryLedgerTarget" in spec &&
      typeof spec.primaryLedgerTarget === "string"
        ? ensureTarget(ledger, spec.primaryLedgerTarget)
        : undefined;
    const secondaryLedgerTarget =
      "secondaryLedgerTarget" in spec &&
      typeof spec.secondaryLedgerTarget === "string"
        ? ensureTarget(ledger, spec.secondaryLedgerTarget)
        : undefined;

    if (
      specRunnerStatus !== "ready" &&
      specRunnerStatus !== "needs-login-identifier-support"
    ) {
      skipped.push({
        id: specId,
        mode: specMode,
        runnerStatus: specRunnerStatus,
        notes: spec.notes,
      });
      continue;
    }

    let config: FlexibleRecord;
    if (
      spec.mode === "dual" &&
      primaryLedgerTarget !== undefined &&
      secondaryLedgerTarget !== undefined
    ) {
      config = createCrossPdsDualConfig({
        spec,
        primaryLedgerTarget,
        secondaryLedgerTarget,
      });
    } else if (spec.mode === "dual") {
      if (ledgerTarget === undefined) {
        throw new Error(`dual target ${specId} is missing its ledger target`);
      }
      config = createDualConfig({ spec, ledgerTarget });
    } else {
      if (ledgerTarget === undefined) {
        throw new Error(`single target ${specId} is missing its ledger target`);
      }
      config = createSingleConfig({ spec, ledgerTarget });
    }

    targets.push({
      id: specId,
      mode: specMode,
      runnerStatus: specRunnerStatus,
      config,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    domain: getUnknown(ledger, "domain"),
    runnableTargets: targets,
    skippedTargets: skipped,
  };
};

const writePlan = async ({
  plan,
  outputDir,
}: {
  plan: Plan;
  outputDir: string;
}): Promise<void> => {
  await fs.mkdir(outputDir, { recursive: true });

  const inventory = {
    generatedAt: plan.generatedAt,
    domain: plan.domain,
    runnableTargets: plan.runnableTargets.map(
      ({ id, mode, runnerStatus, config }) => ({
        id,
        mode,
        runnerStatus,
        pdsUrl: getUnknown(config, "pdsUrl"),
        primaryPdsUrl: getRecord(config.primary)?.pdsUrl,
        secondaryPdsUrl: getRecord(config.secondary)?.pdsUrl,
        artifactsDir: getUnknown(config, "artifactsDir"),
        accountSource: getUnknown(config, "accountSource"),
        pairGroup: getUnknown(config, "pdslabPairGroup"),
        notes: getUnknown(config, "pdslabNotes"),
        loginIdentifier: getRecord(config.account)?.loginIdentifier,
      }),
    ),
    skippedTargets: plan.skippedTargets,
  };

  await fs.writeFile(
    path.join(outputDir, "inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );

  for (const target of plan.runnableTargets) {
    const fileName = `${target.id}.${target.mode}.json`;
    await fs.writeFile(
      path.join(outputDir, fileName),
      `${JSON.stringify(target.config, null, 2)}\n`,
      "utf8",
    );
  }
};

const main = async (argv = process.argv): Promise<number> => {
  const args = parseArgs(argv);
  if (args.help === true) {
    process.stdout.write(usage);
    return 0;
  }

  const ledger = await readJson(args.ledgerPath);
  const plan = createPlan(ledger);
  await writePlan({ plan, outputDir: args.outputDir });

  process.stdout.write(
    `${JSON.stringify(
      {
        wrote: args.outputDir,
        runnableTargets: plan.runnableTargets.map(
          ({ id, mode, runnerStatus }) => ({
            id,
            mode,
            runnerStatus,
          }),
        ),
        skippedTargets: plan.skippedTargets,
      },
      null,
      2,
    )}\n`,
  );

  return 0;
};

const exitCode = await main(process.argv).catch((error: unknown) => {
  process.stderr.write(`${errorMessage(error)}\n`);
  return 1;
});

process.exitCode = exitCode;
