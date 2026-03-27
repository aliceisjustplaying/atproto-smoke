import type * as Playwright from "playwright";
import { errorMessage } from "./runtime-utils.js";

let playwright: typeof Playwright;
const fallbackPlaywrightPath =
  "../../../../tools/browser-automation/node_modules/playwright/index.js";

const importPlaywright = async (
  modulePath: string,
): Promise<typeof Playwright> => {
  const mod: unknown = await import(modulePath);
  if (typeof mod === "object" && mod !== null && "chromium" in mod) {
    return mod as typeof Playwright;
  }
  throw new Error(`module at ${modulePath} is not a Playwright runtime`);
};

try {
  playwright = await importPlaywright("playwright");
} catch (primaryError) {
  try {
    playwright = await importPlaywright(fallbackPlaywrightPath);
  } catch {
    throw new Error(
      [
        "Unable to load Playwright.",
        "Install dependencies with `bun install` and then install a browser with `bunx playwright install chromium`.",
        `Original error: ${errorMessage(primaryError)}`,
      ].join(" "),
    );
  }
}

export const { chromium } = playwright;
