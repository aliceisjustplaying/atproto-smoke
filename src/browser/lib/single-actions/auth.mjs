import { loginToBlueskyApp } from '../runtime-utils.mjs';

export const createSingleAuthActions = ({
  config,
  summary,
  page,
  appBaseUrl,
  wait,
}) => {
  const login = async () => {
    const loginIdentifier = config.loginIdentifier || config.handle;
    await loginToBlueskyApp({
      page,
      appUrl: config.appUrl,
      pdsHost: config.pdsHost,
      loginIdentifier,
      password: config.password,
    });
  };

  const completeAgeAssuranceIfNeeded = async () => {
    const addBirthdate = page.getByRole('button', { name: /(?:update|add) your birthdate/i });
    if (await addBirthdate.count()) {
      await addBirthdate.click({ noWaitAfter: true });
      await wait(800);
      await page.getByTestId('birthdayInput').fill(config.birthdate);
      await page.getByRole('button', { name: /save birthdate/i }).click({ noWaitAfter: true });
      await wait(3000);
      summary.notes.push('Completed age-assurance birthdate gate');
    }
  };

  const gotoProfile = async (handle) => {
    await page.goto(`${appBaseUrl}/profile/${encodeURIComponent(handle)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(3000);
  };

  const maybeFollowTarget = async () => {
    const follow = page.getByTestId('followBtn').first();
    if (!(await follow.count())) {
      const roleFollow = page.getByRole('button', { name: /follow/i }).first();
      if (!(await roleFollow.count())) {
        return { note: 'follow button unavailable' };
      }
      const label = (await roleFollow.getAttribute('aria-label')) ?? '';
      if (/following/i.test(label) || /^Following$/i.test((await roleFollow.innerText()).trim())) {
        return { note: 'already following target' };
      }
      await roleFollow.click({ noWaitAfter: true });
      await wait(2000);
      return { note: 'follow attempted via role button' };
    }
    const label = (await follow.getAttribute('aria-label')) ?? '';
    if (/following/i.test(label) || /^Following$/i.test((await follow.innerText()).trim())) {
      return { note: 'already following target' };
    }
    await follow.click({ noWaitAfter: true });
    await wait(2000);
    return { note: 'follow attempted' };
  };

  const maybeUnfollowTarget = async () => {
    const btn = page.getByTestId('unfollowBtn').first();
    if (!(await btn.count())) {
      return { note: 'already not following target' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(2000);
    return { note: 'unfollow attempted' };
  };

  const openNotifications = async () => {
    await page.goto(`${appBaseUrl}/notifications`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(3000);
    const heading = page.getByText(/^Notifications$/).first();
    if (await heading.count()) {
      await heading.waitFor({ state: 'visible', timeout: 15000 });
    }
  };

  const openSavedPosts = async () => {
    await page.goto(`${appBaseUrl}/saved`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(3000);
  };

  const openProfileTab = async (name) => {
    const tab = page.getByRole('tab', { name }).first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click({ noWaitAfter: true });
    await wait(2000);
  };

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    maybeFollowTarget,
    maybeUnfollowTarget,
    openNotifications,
    openSavedPosts,
    openProfileTab,
  };
};
