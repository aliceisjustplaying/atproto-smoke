let playwright;

try {
  playwright = await import('playwright');
} catch (primaryError) {
  try {
    playwright = await import('../../../../tools/browser-automation/node_modules/playwright/index.mjs');
  } catch {
    throw new Error(
      [
        'Unable to load Playwright.',
        'Install dependencies with `npm install` and then install a browser with `npx playwright install chromium`.',
        `Original error: ${String(primaryError?.message ?? primaryError)}`,
      ].join(' '),
    );
  }
}

export const { chromium } = playwright;
