#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDSLAB_TARGETS } from "../src/lab/pdslab-targets.js";
import type { FlexibleRecord } from "../src/types.js";
import { errorMessage } from "../src/browser/lib/runtime-utils.js";

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

const asRecord = (value: unknown): FlexibleRecord | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as FlexibleRecord;
};

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

const readJson = async (filePath: string): Promise<FlexibleRecord> => {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
};

const ensureTarget = (
  ledger: FlexibleRecord,
  targetId: string,
): FlexibleRecord => {
  const targets = asRecord(ledger.targets);
  const target = asRecord(targets?.[targetId]);
  if (target === undefined) {
    throw new Error(`ledger target missing: ${targetId}`);
  }
  return target;
};

const createAccountDefaults = ({
  spec,
  role,
}: {
  spec: FlexibleRecord;
  role: string;
}): FlexibleRecord => {
  const prefix = `pdslab ${spec.id} ${role}`;
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
  spec,
  role,
}: {
  account: FlexibleRecord;
  loginIdentifierKey?: string;
  spec: FlexibleRecord;
  role: string;
}): FlexibleRecord => {
  if (!account) {
    throw new Error("account details are required");
  }

  const normalized: FlexibleRecord = {
    ...createAccountDefaults({ spec, role }),
    handle: account.handle,
    password: account.password,
  };

  if (loginIdentifierKey) {
    const loginIdentifier = account[loginIdentifierKey];
    if (typeof loginIdentifier !== "string" || loginIdentifier.length === 0) {
      throw new Error(
        `missing loginIdentifierKey "${loginIdentifierKey}" on account`,
      );
    }
    normalized.loginIdentifier = loginIdentifier;
  }

  if (account.did) {
    normalized.did = account.did;
  }
  if (account.email) {
    normalized.email = account.email;
  }
  if (account.pdsUrl) {
    normalized.pdsUrl = account.pdsUrl;
  }
  if (account.pdsHost) {
    normalized.pdsHost = account.pdsHost;
  }

  return normalized;
};

const createSingleConfig = ({
  spec,
  ledgerTarget,
}: {
  spec: FlexibleRecord;
  ledgerTarget: FlexibleRecord;
}): FlexibleRecord => {
  const accountSource = spec.currentDeploymentKey
    ? ledgerTarget[String(spec.currentDeploymentKey)]
    : asRecord(ledgerTarget.accounts)?.[String(spec.ledgerAccount)];
  const normalizedAccountSource = asRecord(accountSource);

  if (normalizedAccountSource === undefined) {
    throw new Error(
      `single target ${spec.id} is missing its account in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: ledgerTarget.pdsUrl,
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    targetHandle: "smoke-a.perlsky.pdslab.net",
    accountSource: spec.accountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabPairGroup: spec.pairGroup,
    pdslabNotes: spec.notes,
    account: createAccount({
      account: normalizedAccountSource,
      loginIdentifierKey:
        typeof spec.loginIdentifierKey === "string"
          ? spec.loginIdentifierKey
          : undefined,
      spec,
      role:
        typeof spec.ledgerAccount === "string" ? spec.ledgerAccount : "single",
    }),
  };
};

const createDualConfig = ({
  spec,
  ledgerTarget,
}: {
  spec: FlexibleRecord;
  ledgerTarget: FlexibleRecord;
}): FlexibleRecord => {
  const accounts = asRecord(ledgerTarget.accounts);
  const primary = asRecord(accounts?.["smoke-a"]);
  const secondary = asRecord(accounts?.["smoke-b"]);
  if (primary === undefined || secondary === undefined) {
    throw new Error(
      `dual target ${spec.id} is missing smoke-a or smoke-b in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: ledgerTarget.pdsUrl,
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    accountSource: spec.accountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabNotes: spec.notes,
    primary: createAccount({ account: primary, spec, role: "primary" }),
    secondary: createAccount({ account: secondary, spec, role: "secondary" }),
  };
};

const createCrossPdsDualConfig = ({
  spec,
  primaryLedgerTarget,
  secondaryLedgerTarget,
}: {
  spec: FlexibleRecord;
  primaryLedgerTarget: FlexibleRecord;
  secondaryLedgerTarget: FlexibleRecord;
}): FlexibleRecord => {
  const primarySource = spec.primaryCurrentDeploymentKey
    ? primaryLedgerTarget[String(spec.primaryCurrentDeploymentKey)]
    : asRecord(primaryLedgerTarget.accounts)?.[
        String(spec.primaryLedgerAccount)
      ];
  const secondarySource = spec.secondaryCurrentDeploymentKey
    ? secondaryLedgerTarget[String(spec.secondaryCurrentDeploymentKey)]
    : asRecord(secondaryLedgerTarget.accounts)?.[
        String(spec.secondaryLedgerAccount)
      ];

  if (!asRecord(primarySource) || !asRecord(secondarySource)) {
    throw new Error(
      `cross-PDS target ${spec.id} is missing one of its accounts in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: primaryLedgerTarget.pdsUrl,
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    accountSource: spec.accountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabNotes: spec.notes,
    primary: createAccount({
      account: {
        ...asRecord(primarySource),
        pdsUrl: primaryLedgerTarget.pdsUrl,
      },
      loginIdentifierKey:
        typeof spec.primaryLoginIdentifierKey === "string"
          ? spec.primaryLoginIdentifierKey
          : undefined,
      spec,
      role: "primary",
    }),
    secondary: createAccount({
      account: {
        ...asRecord(secondarySource),
        pdsUrl: secondaryLedgerTarget.pdsUrl,
      },
      loginIdentifierKey:
        typeof spec.secondaryLoginIdentifierKey === "string"
          ? spec.secondaryLoginIdentifierKey
          : undefined,
      spec,
      role: "secondary",
    }),
  };
};

const createPlan = (ledger: FlexibleRecord): Plan => {
  const targets: PlanTarget[] = [];
  const skipped: SkippedTarget[] = [];

  for (const spec of PDSLAB_TARGETS as readonly FlexibleRecord[]) {
    const specId = String(spec.id);
    const specMode = String(spec.mode);
    const specRunnerStatus = String(spec.runnerStatus);
    const needsLedgerTarget = typeof spec.ledgerTarget === "string";
    const ledgerTarget = needsLedgerTarget
      ? ensureTarget(ledger, String(spec.ledgerTarget))
      : null;
    const primaryLedgerTarget =
      typeof spec.primaryLedgerTarget === "string"
        ? ensureTarget(ledger, String(spec.primaryLedgerTarget))
        : null;
    const secondaryLedgerTarget =
      typeof spec.secondaryLedgerTarget === "string"
        ? ensureTarget(ledger, String(spec.secondaryLedgerTarget))
        : null;

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
      spec.primaryLedgerTarget &&
      spec.secondaryLedgerTarget
    ) {
      if (!primaryLedgerTarget || !secondaryLedgerTarget) {
        throw new Error(
          `cross-PDS target ${specId} is missing its ledger targets`,
        );
      }
      config = createCrossPdsDualConfig({
        spec,
        primaryLedgerTarget,
        secondaryLedgerTarget,
      });
    } else if (spec.mode === "dual") {
      if (!ledgerTarget) {
        throw new Error(`dual target ${specId} is missing its ledger target`);
      }
      config = createDualConfig({ spec, ledgerTarget });
    } else {
      if (!ledgerTarget) {
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
    domain: ledger.domain,
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
        pdsUrl: config.pdsUrl,
        primaryPdsUrl: asRecord(config.primary)?.pdsUrl,
        secondaryPdsUrl: asRecord(config.secondary)?.pdsUrl,
        artifactsDir: config.artifactsDir,
        accountSource: config.accountSource,
        pairGroup: config.pdslabPairGroup,
        notes: config.pdslabNotes,
        loginIdentifier: asRecord(config.account)?.loginIdentifier,
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
  if (args.help) {
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

const exitCode = await main(process.argv).catch((error) => {
  process.stderr.write(`${errorMessage(error)}\n`);
  return 1;
});

process.exitCode = exitCode;
