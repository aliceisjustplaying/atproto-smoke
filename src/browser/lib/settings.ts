import type { Page } from "playwright";
import type { FlexibleRecord } from "../../types.js";
import type { PageWait } from "./browser-types.js";

interface SettingsHelpers {
  setCheckboxSetting: (
    page: Page,
    route: string,
    name: string,
    desired: boolean,
  ) => Promise<FlexibleRecord>;
  setRadioSetting: (
    page: Page,
    route: string,
    name: string,
  ) => Promise<FlexibleRecord>;
}

export const createSettingsHelpers = ({
  appBaseUrl,
  wait,
}: {
  appBaseUrl: string;
  wait: PageWait;
}): SettingsHelpers => {
  const openSettingRoute = async (page: Page, route: string): Promise<void> => {
    await page.goto(`${appBaseUrl}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await wait(page, 3000);
  };

  const roleSetting = (
    page: Page,
    role: "checkbox" | "radio",
    name: string,
  ): ReturnType<Page["getByRole"]> => page.getByRole(role, { name }).first();

  const settingState = async (
    page: Page,
    role: "checkbox" | "radio",
    name: string,
  ): Promise<boolean> => {
    const locator = roleSetting(page, role, name);
    await locator.waitFor({ state: "visible", timeout: 15000 });
    return (await locator.getAttribute("aria-checked")) === "true";
  };

  const setPersistedSetting = async ({
    page,
    route,
    role,
    name,
    desired,
    verifyError,
    result,
  }: {
    page: Page;
    route: string;
    role: "checkbox" | "radio";
    name: string;
    desired: boolean;
    verifyError: (verified: boolean) => string;
    result: (verified: boolean) => FlexibleRecord;
  }): Promise<FlexibleRecord> => {
    await openSettingRoute(page, route);
    const locator = roleSetting(page, role, name);
    const current = await settingState(page, role, name);
    if (current !== desired) {
      await locator.click({ noWaitAfter: true });
      await wait(page, 2000);
    }
    await openSettingRoute(page, route);
    const verified = await settingState(page, role, name);
    if (verified !== desired) {
      throw new Error(verifyError(verified));
    }
    return result(verified);
  };

  const setCheckboxSetting = async (
    page: Page,
    route: string,
    name: string,
    desired: boolean,
  ): Promise<FlexibleRecord> => {
    return await setPersistedSetting({
      page,
      route,
      role: "checkbox",
      name,
      desired,
      verifyError: (verified) =>
        `checkbox setting ${name} on ${route} expected ${String(desired)} but saw ${String(verified)}`,
      result: (verified) => ({ desired, verified }),
    });
  };

  const setRadioSetting = async (
    page: Page,
    route: string,
    name: string,
  ): Promise<FlexibleRecord> => {
    return await setPersistedSetting({
      page,
      route,
      role: "radio",
      name,
      desired: true,
      verifyError: () => `radio setting ${name} on ${route} did not persist`,
      result: () => ({ selected: name }),
    });
  };

  return {
    setCheckboxSetting,
    setRadioSetting,
  };
};
