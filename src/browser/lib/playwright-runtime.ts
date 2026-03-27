import { errorMessage } from "./runtime-utils.js";

let playwright: typeof import("playwright");
const fallbackPlaywrightPath =
  "../../../../tools/browser-automation/node_modules/playwright/index.js";

try {
  playwright = await import("playwright");
} catch (primaryError) {
  try {
    playwright = await import(fallbackPlaywrightPath);
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
