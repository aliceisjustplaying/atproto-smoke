import fs from 'node:fs/promises';
import {
  createBringYourOwnDualConfig,
  createBringYourOwnSingleConfig,
} from './adapters/bring-your-own.mjs';
import {
  createPerlskyDualConfig,
  createPerlskySingleConfig,
} from './adapters/perlsky.mjs';

const usage = `Usage:
  atproto-smoke run-single [--adapter bring-your-own|perlsky] --config config.json
  atproto-smoke run-dual [--adapter bring-your-own|perlsky] --config config.json
  atproto-smoke validate --mode single|dual [--adapter bring-your-own|perlsky] --config config.json
  atproto-smoke print-example --mode single|dual [--adapter bring-your-own|perlsky]

Notes:
  - bring-your-own is the default adapter
  - v1 is browser-first against bsky.app
  - direct API/AppView contract layers are documented as a later v2 expansion
`;

const parseArgs = (argv) => {
  const result = {
    command: argv[2],
    adapter: 'bring-your-own',
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') {
      result.configPath = argv[++i];
      continue;
    }
    if (arg === '--mode') {
      result.mode = argv[++i];
      continue;
    }
    if (arg === '--adapter') {
      result.adapter = argv[++i];
      continue;
    }
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      result.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return result;
};

const createExampleConfig = ({ mode, adapter }) => {
  const base = {
    pdsUrl: 'https://your-pds.example',
    artifactsDir: `data/browser-smoke/${adapter}-${mode}`,
    targetHandle: 'alice.mosphere.at',
    strictErrors: true,
  };

  if (mode === 'single') {
    return {
      ...base,
      editProfile: true,
      account: {
        handle: 'smoke-primary.your-pds.example',
        password: 'replace-me',
      },
    };
  }

  return {
    ...base,
    primary: {
      handle: 'smoke-primary.your-pds.example',
      password: 'replace-me',
    },
    secondary: {
      handle: 'smoke-secondary.your-pds.example',
      password: 'replace-me-too',
    },
  };
};

const normalizeMode = (command, mode) => {
  if (command === 'run-single') {
    return 'single';
  }
  if (command === 'run-dual') {
    return 'dual';
  }
  return mode;
};

const normalizeConfig = ({ mode, adapter, raw }) => {
  if (mode === 'single') {
    return adapter === 'perlsky'
      ? createPerlskySingleConfig(raw)
      : createBringYourOwnSingleConfig(raw);
  }
  if (mode === 'dual') {
    return adapter === 'perlsky'
      ? createPerlskyDualConfig(raw)
      : createBringYourOwnDualConfig(raw);
  }
  throw new Error(`unsupported mode: ${mode}`);
};

const loadJsonConfig = async (configPath) => {
  const text = await fs.readFile(configPath, 'utf8');
  return JSON.parse(text);
};

export const runCliFromArgv = async (argv = process.argv) => {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    console.log(usage);
    return 0;
  }

  const mode = normalizeMode(args.command, args.mode);

  if (args.command === 'print-example') {
    if (!mode) {
      throw new Error('print-example requires --mode single|dual');
    }
    console.log(JSON.stringify(createExampleConfig({ mode, adapter: args.adapter }), null, 2));
    return 0;
  }

  if (!mode) {
    throw new Error('validate requires --mode single|dual');
  }
  if (!args.configPath) {
    throw new Error('--config is required');
  }

  const raw = await loadJsonConfig(args.configPath);
  const config = normalizeConfig({ mode, adapter: args.adapter, raw });

  if (args.command === 'validate') {
    console.log(JSON.stringify(config, null, 2));
    return 0;
  }

  if (args.command === 'run-single') {
    const { runSingleFromConfig } = await import('./browser/run-single.mjs');
    const summary = await runSingleFromConfig(config);
    return summary.ok ? 0 : 1;
  }

  if (args.command === 'run-dual') {
    const { runDualFromConfig } = await import('./browser/run-dual.mjs');
    const summary = await runDualFromConfig(config);
    return summary.ok ? 0 : 1;
  }

  throw new Error(`unsupported command: ${args.command}`);
};
