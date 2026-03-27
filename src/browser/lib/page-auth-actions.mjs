export const createPageAuthActions = ({
  appUrl,
  appBaseUrl,
  wait,
  loginToBlueskyApp,
}) => {
  const login = async (
    page,
    {
      pdsHost,
      loginIdentifier,
      password,
      notes,
      noteTarget,
    },
  ) =>
    loginToBlueskyApp({
      page,
      appUrl,
      pdsHost,
      loginIdentifier,
      password,
      notes,
      noteTarget,
    });

  const completeAgeAssuranceIfNeeded = async (page, { birthdate, notes, noteText }) => {
    const addBirthdate = page.getByRole('button', { name: /(?:update|add) your birthdate/i });
    if (await addBirthdate.count()) {
      await addBirthdate.click({ noWaitAfter: true });
      await wait(page, 800);
      await page.getByTestId('birthdayInput').fill(birthdate);
      await page.getByRole('button', { name: /save birthdate/i }).click({ noWaitAfter: true });
      await wait(page, 3000);
      if (Array.isArray(notes) && noteText) {
        notes.push(noteText);
      }
    }
  };

  const gotoProfile = async (page, handle) => {
    await page.goto(`${appBaseUrl}/profile/${encodeURIComponent(handle)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(page, 3000);
  };

  const waitForProfileHandle = async (page, handle, timeout = 20000) => {
    const shortHandle = handle.replace(/^@/, '');
    await page.getByText(`@${shortHandle}`).first().waitFor({ state: 'visible', timeout });
  };

  const maybeFollow = async (page) => {
    const follow = page.getByTestId('followBtn').first();
    if (await follow.count()) {
      const label = (await follow.getAttribute('aria-label')) ?? '';
      if (/following/i.test(label) || /^Following$/i.test((await follow.innerText()).trim())) {
        return { note: 'already following' };
      }
      await follow.click({ noWaitAfter: true });
      await wait(page, 2000);
      return { note: 'follow attempted' };
    }
    const roleFollow = page.getByRole('button', { name: /follow/i }).first();
    if (!(await roleFollow.count())) {
      return { note: 'follow button unavailable' };
    }
    const label = (await roleFollow.getAttribute('aria-label')) ?? '';
    if (/following/i.test(label) || /^Following$/i.test((await roleFollow.innerText()).trim())) {
      return { note: 'already following' };
    }
    await roleFollow.click({ noWaitAfter: true });
    await wait(page, 2000);
    return { note: 'follow attempted via role button' };
  };

  const maybeUnfollow = async (page) => {
    const btn = page.getByTestId('unfollowBtn').first();
    if (!(await btn.count())) {
      return { note: 'already not following' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(page, 2000);
    return { note: 'unfollow attempted' };
  };

  const openNotifications = async (page) => {
    await page.goto(`${appBaseUrl}/notifications`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(page, 3000);
    const heading = page.getByText(/^Notifications$/).first();
    if (await heading.count()) {
      await heading.waitFor({ state: 'visible', timeout: 15000 });
    }
  };

  const openSavedPosts = async (page) => {
    await page.goto(`${appBaseUrl}/saved`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await wait(page, 3000);
  };

  const openProfileTab = async (page, name) => {
    const tab = page.getByRole('tab', { name }).first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click({ noWaitAfter: true });
    await wait(page, 2000);
  };

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    waitForProfileHandle,
    maybeFollow,
    maybeUnfollow,
    openNotifications,
    openSavedPosts,
    openProfileTab,
  };
};
