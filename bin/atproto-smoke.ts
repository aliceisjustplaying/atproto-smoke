#!/usr/bin/env node
import { errorMessage } from "../src/browser/lib/runtime-utils.js";
import { runCliFromArgv } from "../src/cli.js";

try {
  const exitCode = await runCliFromArgv(process.argv);
  process.exit(exitCode);
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
