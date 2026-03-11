import fs from 'node:fs/promises';
import path from 'node:path';

export const createSingleActions = ({
  config,
  summary,
  page,
  appBaseUrl,
  wait,
  sleep,
  normalizeText,
  buttonText,
  fetchStatus,
  pollJson,
  avatarPngBase64,
}) => {
  const ensureAvatarFixture = async () => {
    const file = path.join(config.artifactsDir, 'avatar-fixture.png');
    await fs.writeFile(file, Buffer.from(avatarPngBase64, 'base64'));
    return file;
  };

  const login = async () => {
    await page.goto(config.appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: 'Sign in' }).nth(0).click({ noWaitAfter: true });
    await wait(1000);
    await page.getByRole('button', { name: 'Bluesky Social' }).evaluate((el) => el.click());
    await wait(500);
    await page.getByText('Custom').evaluate((el) => el.click());
    await wait(500);
    await page.getByPlaceholder('my-server.com').fill(config.pdsHost);
    await page.getByRole('button', { name: 'Done' }).evaluate((el) => el.click());
    await wait(500);
    const close = page.getByRole('button', { name: 'Close welcome modal' });
    if (await close.count()) {
      await close.evaluate((el) => el.click());
      await wait(300);
    }
    await page.getByPlaceholder('Username or email address').fill(config.handle);
    await page.getByPlaceholder('Password').fill(config.password);
    await page.getByTestId('loginNextButton').click({ noWaitAfter: true });
    await wait(3000);
  };

  const completeAgeAssuranceIfNeeded = async () => {
    const addBirthdate = page.getByRole('button', { name: /update your birthdate/i });
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

  const composePost = async (text) => {
    await page.locator('[aria-label="Compose new post"]').last().click({ noWaitAfter: true });
    await wait(800);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    await wait(300);
    await page.getByRole('button', { name: 'Publish post' }).click({ noWaitAfter: true });
    await wait(4000);
  };

  const waitForProfileHandle = async (handle, timeout = 20000) => {
    const shortHandle = handle.replace(/^@/, '');
    const handleText = shortHandle.startsWith('@') ? shortHandle : `@${shortHandle}`;
    await page.getByText(handleText).first().waitFor({ state: 'visible', timeout });
  };

  const findRowByPrimaryText = async (needle, timeout = 60000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const rows = page.locator('[data-testid^="feedItem-by-"]');
      const count = await rows.count();
      for (let i = 0; i < count; i += 1) {
        const row = rows.nth(i);
        const primary = row.locator('[data-testid="postText"]').first();
        if (!(await primary.count())) {
          continue;
        }
        const text = normalizeText(await primary.textContent());
        if (text === needle) {
          await row.waitFor({ state: 'visible', timeout: 10000 });
          return row;
        }
      }
      await wait(1000);
    }
    throw new Error(`feed item with primary text not found: ${needle}`);
  };

  const maybeFindRowByPrimaryText = async (needle, timeout = 5000) => {
    try {
      return await findRowByPrimaryText(needle, timeout);
    } catch {
      return null;
    }
  };

  const findFirstFeedItem = async (timeout = 60000) => {
    const row = page.locator('[data-testid^="feedItem-by-"]').first();
    await row.waitFor({ state: 'visible', timeout });
    return row;
  };

  const clickLike = async (row) => {
    const btn = row.getByTestId('likeBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(1500);
  };

  const clickRepost = async (row) => {
    const btn = row.getByTestId('repostBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(500);
    const repost = page.getByText(/^Repost$/).last();
    if (await repost.count()) {
      await repost.click({ noWaitAfter: true });
      await wait(1500);
    }
  };

  const clickQuote = async (row, text) => {
    const btn = row.getByTestId('repostBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(500);
    const quote = page.getByText(/^Quote post$/).last();
    if (!(await quote.count())) {
      throw new Error('quote option not available');
    }
    await quote.click({ noWaitAfter: true });
    await wait(1000);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    await page.getByRole('button', { name: 'Publish post' }).click({ noWaitAfter: true });
    await wait(4000);
  };

  const clickReply = async (row, text) => {
    const btn = row.getByTestId('replyBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(1000);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    const publishReply = page.getByRole('button', { name: /publish reply|reply/i }).last();
    await publishReply.click({ noWaitAfter: true });
    await wait(4000);
  };

  const ensureBookmarked = async (row) => {
    const btn = row.getByTestId('postBookmarkBtn').first();
    const before = await buttonText(btn);
    if (/remove from saved posts/i.test(before)) {
      return { note: 'already bookmarked' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(1500);
    return { note: await buttonText(btn) };
  };

  const ensureNotBookmarked = async (row) => {
    const btn = row.getByTestId('postBookmarkBtn').first();
    const before = await buttonText(btn);
    if (!/remove from saved posts/i.test(before)) {
      return { note: 'already not bookmarked' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(1500);
    return { note: await buttonText(btn) };
  };

  const ensureLiked = async (row) => {
    const btn = row.getByTestId('likeBtn').first();
    const before = await buttonText(btn);
    if (/unlike/i.test(before)) {
      return { note: 'already liked' };
    }
    await clickLike(row);
    return { note: await buttonText(btn) };
  };

  const ensureNotLiked = async (row) => {
    const btn = row.getByTestId('likeBtn').first();
    const before = await buttonText(btn);
    if (!/unlike/i.test(before)) {
      return { note: 'already not liked' };
    }
    await clickLike(row);
    return { note: await buttonText(btn) };
  };

  const ensureReposted = async (row) => {
    const btn = row.getByTestId('repostBtn').first();
    const before = await buttonText(btn);
    if (/undo repost|remove repost/i.test(before)) {
      return { note: 'already reposted' };
    }
    await clickRepost(row);
    return { note: await buttonText(btn) };
  };

  const ensureNotReposted = async (row) => {
    const btn = row.getByTestId('repostBtn').first();
    const before = await buttonText(btn);
    if (!/undo repost|remove repost/i.test(before)) {
      return { note: 'already not reposted' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(1500);
    return { note: await buttonText(btn) };
  };

  const openProfileTab = async (name) => {
    const tab = page.getByRole('tab', { name }).first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click({ noWaitAfter: true });
    await wait(2000);
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

  const openPostOptions = async (row) => {
    const btn = row.getByTestId('postDropdownBtn').first();
    await btn.click({ noWaitAfter: true });
    const menu = page.locator('[role="menu"]').last();
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    return menu;
  };

  const deletePostRow = async (row) => {
    await openPostOptions(row);
    const deleteItem = page.getByRole('menuitem', { name: /delete post/i }).first();
    await deleteItem.waitFor({ state: 'visible', timeout: 10000 });
    await deleteItem.click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const confirm = page.getByRole('button', { name: /^Delete$/i }).last();
    await confirm.click({ noWaitAfter: true });
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await wait(3000);
  };

  const maybeDeleteOwnPostByText = async (text, successNote) => {
    const row = await maybeFindRowByPrimaryText(text, 10000);
    if (!row) {
      return { note: `not surfaced for cleanup: ${text}` };
    }
    await deletePostRow(row);
    return { note: successNote };
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

  const verifyPublicHandleResolution = async () => {
    const result = await pollJson(
      'public handle resolution',
      () => `${config.publicApiUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) => ok && typeof json?.did === 'string' && json.did.length > 0,
      config.publicCheckTimeoutMs ?? 180000,
    );
    return { did: result.json.did };
  };

  const verifyPublicAuthorFeed = async () => {
    const result = await pollJson(
      'public author feed indexing',
      () => `${config.publicApiUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(config.handle)}&limit=20`,
      ({ ok, json }) =>
        ok && Array.isArray(json?.feed) && json.feed.some((item) => item?.post?.record?.text === config.postText),
      config.publicCheckTimeoutMs ?? 180000,
    );
    const matching = result.json.feed.find((item) => item?.post?.record?.text === config.postText);
    return {
      uri: matching?.post?.uri,
      cid: matching?.post?.cid,
    };
  };

  const verifyPublicProfile = async () => {
    const result = await pollJson(
      'public profile indexing',
      () => `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) => ok && typeof json?.postsCount === 'number' && json.postsCount > 0,
      config.publicCheckTimeoutMs ?? 180000,
    );
    return {
      postsCount: result.json.postsCount,
      followersCount: result.json.followersCount,
      followsCount: result.json.followsCount,
      avatar: result.json.avatar,
      description: result.json.description,
    };
  };

  const verifyPublicProfileAfterEdit = async () => {
    const result = await pollJson(
      'public profile edit indexing',
      () => `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok &&
        json?.description === config.profileNote &&
        typeof json?.avatar === 'string' &&
        json.avatar.length > 0,
      config.publicCheckTimeoutMs ?? 180000,
    );
    const avatarResult = await fetchStatus(result.json.avatar);
    if (!avatarResult.ok) {
      throw new Error(`public avatar URL returned ${avatarResult.status}`);
    }
    return {
      avatar: result.json.avatar,
      avatarStatus: avatarResult.status,
      description: result.json.description,
    };
  };

  const verifyLocalProfileAfterEdit = async () => {
    const didResult = await pollJson(
      'local handle resolution after profile edit',
      () => `${config.pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) => ok && typeof json?.did === 'string' && json.did.length > 0,
      30000,
    );
    const did = didResult.json.did;
    const result = await pollJson(
      'local profile record after edit',
      () =>
        `${config.pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.bsky.actor.profile&rkey=self`,
      ({ ok, json }) =>
        ok &&
        json?.value?.description === config.profileNote &&
        typeof json?.value?.avatar?.ref?.$link === 'string' &&
        json.value.avatar.ref.$link.length > 0,
      30000,
    );
    return {
      did,
      avatarCid: result.json.value.avatar.ref.$link,
      description: result.json.value.description,
    };
  };

  const dismissModalBackdropIfPresent = async () => {
    const backdrop = page.locator('[aria-label*="click to close"]').last();
    if (await backdrop.count()) {
      await backdrop.click({ force: true, noWaitAfter: true }).catch(() => undefined);
      await wait(400);
    }
  };

  const uploadProfileAvatar = async () => {
    const avatarFile = await ensureAvatarFixture();
    let fileInputs = page.locator('input[type="file"]');
    let count = await fileInputs.count();

    if (count === 0) {
      const changeAvatar = page.getByTestId('changeAvatarBtn').first();
      if (await changeAvatar.count()) {
        await changeAvatar.click({ noWaitAfter: true });
        await wait(500);
        const uploadFromFiles = page.getByTestId('changeAvatarLibraryBtn').first();
        if (await uploadFromFiles.count()) {
          const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
          await uploadFromFiles.click({ noWaitAfter: true });
          const chooser = await chooserPromise;
          await chooser.setFiles(avatarFile);
          await wait(750);
          const editImageHeading = page.getByText(/^Edit image$/).last();
          if (await editImageHeading.count()) {
            await editImageHeading.waitFor({ state: 'visible', timeout: 10000 });
            const cropSave = page.getByRole('button', { name: 'Save' }).last();
            await cropSave.click({ noWaitAfter: true });
            await editImageHeading.waitFor({ state: 'hidden', timeout: 15000 });
            summary.notes.push('profile avatar crop saved');
          }
          summary.notes.push('profile avatar uploaded via file chooser');
          await wait(1500);
          return avatarFile;
        }
      }
    }

    if (count === 0) {
      throw new Error('profile avatar file input unavailable');
    }

    await fileInputs.first().setInputFiles(avatarFile);
    await wait(1500);
    summary.notes.push(`edit profile file inputs: ${count}`);
    return avatarFile;
  };

  const editProfile = async () => {
    const edit = page.getByRole('button', { name: /edit profile/i });
    if (!(await edit.count())) {
      throw new Error('edit profile button unavailable');
    }
    await edit.click({ noWaitAfter: true });
    await wait(1000);
    await dismissModalBackdropIfPresent();
    const avatarFile = await uploadProfileAvatar();
    const bioField = page.locator('textarea[aria-label="Description"]').first();
    if (await bioField.count()) {
      await bioField.fill(config.profileNote);
      const actual = await bioField.inputValue();
      if (actual !== config.profileNote) {
        throw new Error(`profile description fill did not stick: ${actual}`);
      }
    }
    const save = page.getByTestId('editProfileSaveBtn');
    await save.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="editProfileSaveBtn"]');
      return !!btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
    }, undefined, { timeout: 15000 });
    await save.click({ noWaitAfter: true });
    await page.waitForFunction(() => !document.querySelector('[data-testid="editProfileSaveBtn"]'), undefined, {
      timeout: 15000,
    });
    await wait(3000);
    return { avatarFile, profileNote: config.profileNote };
  };

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    maybeFollowTarget,
    composePost,
    waitForProfileHandle,
    findRowByPrimaryText,
    findFirstFeedItem,
    clickQuote,
    clickReply,
    ensureBookmarked,
    ensureNotBookmarked,
    ensureLiked,
    ensureNotLiked,
    ensureReposted,
    ensureNotReposted,
    openProfileTab,
    maybeUnfollowTarget,
    maybeDeleteOwnPostByText,
    openNotifications,
    openSavedPosts,
    verifyPublicHandleResolution,
    verifyPublicAuthorFeed,
    verifyPublicProfile,
    verifyPublicProfileAfterEdit,
    verifyLocalProfileAfterEdit,
    editProfile,
  };
};
