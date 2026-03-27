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

  const setPersistedSetting = async ({
    page,
    route,
    role,
    name,
    desired,
    verifyError,
    result,
  }) => {
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

  const setCheckboxSetting = async (page, route, name, desired) => {
    return await setPersistedSetting({
      page,
      route,
      role: 'checkbox',
      name,
      desired,
      verifyError: (verified) => `checkbox setting ${name} on ${route} expected ${desired} but saw ${verified}`,
      result: (verified) => ({ desired, verified }),
    });
  };

  const setRadioSetting = async (page, route, name) => {
    return await setPersistedSetting({
      page,
      route,
      role: 'radio',
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
