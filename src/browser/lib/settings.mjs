export const createSettingsHelpers = ({ appBaseUrl, wait }) => {
  const openSettingRoute = async (page, route) => {
    await page.goto(`${appBaseUrl}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(page, 3000);
  };

  const roleSetting = (page, role, name) => page.getByRole(role, { name }).first();

  const settingState = async (page, role, name) => {
    const locator = roleSetting(page, role, name);
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    return (await locator.getAttribute('aria-checked')) === 'true';
  };

  const setCheckboxSetting = async (page, route, name, desired) => {
    await openSettingRoute(page, route);
    const locator = roleSetting(page, 'checkbox', name);
    const current = await settingState(page, 'checkbox', name);
    if (current !== desired) {
      await locator.click({ noWaitAfter: true });
      await wait(page, 2000);
    }
    await openSettingRoute(page, route);
    const verified = await settingState(page, 'checkbox', name);
    if (verified !== desired) {
      throw new Error(`checkbox setting ${name} on ${route} expected ${desired} but saw ${verified}`);
    }
    return { desired, verified };
  };

  const setRadioSetting = async (page, route, name) => {
    await openSettingRoute(page, route);
    const locator = roleSetting(page, 'radio', name);
    const current = await settingState(page, 'radio', name);
    if (!current) {
      await locator.click({ noWaitAfter: true });
      await wait(page, 2000);
    }
    await openSettingRoute(page, route);
    const verified = await settingState(page, 'radio', name);
    if (!verified) {
      throw new Error(`radio setting ${name} on ${route} did not persist`);
    }
    return { selected: name };
  };

  return {
    openSettingRoute,
    roleSetting,
    settingState,
    setCheckboxSetting,
    setRadioSetting,
  };
};
