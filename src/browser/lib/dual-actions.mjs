import fs from 'node:fs/promises';
import path from 'node:path';

export const createDualActions = ({
  config,
  summary,
  appBaseUrl,
  wait,
  sleep,
  normalizeText,
  buttonText,
  fetchJson,
  fetchStatus,
  xrpcJson,
  avatarPngBase64,
}) => {
  const parseCompactCount = (raw) => {
    if (typeof raw !== 'string') {
      return undefined;
    }
    const normalized = raw.replace(/,/g, '').trim();
    const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i);
    if (!match) {
      return undefined;
    }
    const base = Number(match[1]);
    const suffix = (match[2] || '').toUpperCase();
    const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
    return Math.round(base * multiplier);
  };

  const ensureAvatarFixture = async () => {
    const file = path.join(config.artifactsDir, 'avatar-fixture.png');
    await fs.writeFile(file, Buffer.from(avatarPngBase64, 'base64'));
    return file;
  };

  const login = async (page, account) => {
    const loginIdentifier = account.loginIdentifier || account.handle;
    await page.goto(config.appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: 'Sign in' }).nth(0).click({ noWaitAfter: true });
    await wait(page, 1000);
    await page.getByRole('button', { name: 'Bluesky Social' }).evaluate((el) => el.click());
    await wait(page, 500);
    await page.getByText('Custom').evaluate((el) => el.click());
    await wait(page, 500);
    await page.getByPlaceholder('my-server.com').fill(config.pdsHost);
    await page.getByRole('button', { name: 'Done' }).evaluate((el) => el.click());
    await wait(page, 500);
    const close = page.getByRole('button', { name: 'Close welcome modal' });
    if (await close.count()) {
      await close.evaluate((el) => el.click());
      await wait(page, 300);
    }
    await page.getByPlaceholder('Username or email address').fill(loginIdentifier);
    await page.getByPlaceholder('Password').fill(account.password);
    await page.getByTestId('loginNextButton').click({ noWaitAfter: true });
    await wait(page, 3000);
  };

  const completeAgeAssuranceIfNeeded = async (page, account) => {
    const addBirthdate = page.getByRole('button', { name: /update your birthdate/i });
    if (await addBirthdate.count()) {
      await addBirthdate.click({ noWaitAfter: true });
      await wait(page, 800);
      await page.getByTestId('birthdayInput').fill(account.birthdate);
      await page.getByRole('button', { name: /save birthdate/i }).click({ noWaitAfter: true });
      await wait(page, 3000);
      summary.notes.push(`Completed age-assurance birthdate gate for ${account.handle}`);
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
    const handleText = shortHandle.startsWith('@') ? shortHandle : `@${shortHandle}`;
    await page.getByText(handleText).first().waitFor({ state: 'visible', timeout });
  };

  const readRenderedProfileCounts = async (page) => {
    const raw = await page.evaluate(() => {
      const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
      const entries = Array.from(document.querySelectorAll('a[href]')).map((node) => ({
        href: node.getAttribute('href') || '',
        text: normalize(node.textContent || ''),
      }));
      const pick = (pattern) => entries.find((entry) => pattern.test(entry.href))?.text;
      const bodyText = normalize(document.body?.innerText || '');
      const followersFallback = bodyText.match(/([0-9][0-9.,]*\s*[KMB]?)\s+followers?/i)?.[0];
      const followsFallback = bodyText.match(/([0-9][0-9.,]*\s*[KMB]?)\s+(?:following|follows?)/i)?.[0];
      return {
        followersText: pick(/\/followers(?:[/?#]|$)/i) || followersFallback,
        followsText: pick(/\/follows(?:[/?#]|$)/i) || followsFallback,
      };
    });

    const parseLinkedCount = (text, label) => {
      if (typeof text !== 'string' || !text.length) {
        throw new Error(`rendered ${label} link text not found`);
      }
      const normalized = text.replace(/\s+/g, ' ').trim();
      const match = normalized.match(/([0-9][0-9.,]*\s*[KMB]?)/i);
      if (!match) {
        throw new Error(`unable to parse rendered ${label} count from "${normalized}"`);
      }
      const value = parseCompactCount(match[1].replace(/\s+/g, ''));
      if (value === undefined) {
        throw new Error(`unable to normalize rendered ${label} count from "${normalized}"`);
      }
      return value;
    };

    return {
      followersCount: parseLinkedCount(raw.followersText, 'followers'),
      followsCount: parseLinkedCount(raw.followsText, 'follows'),
      raw,
    };
  };

  const verifyProfileCountsAfterReload = async (page, viewerAccount, profileHandle, expected, timeoutMs = 30000) => {
    const started = Date.now();
    let lastRendered;
    let lastApi;
    while (Date.now() - started < timeoutMs) {
      await gotoProfile(page, profileHandle);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await wait(page, 3000);
      await waitForProfileHandle(page, profileHandle);
      lastRendered = await readRenderedProfileCounts(page);
      const apiResult = await xrpcJson('app.bsky.actor.getProfile', {
        token: viewerAccount?.accessJwt,
        params: { actor: profileHandle },
        timeoutMs: 15000,
      });
      if (apiResult.ok) {
        lastApi = {
          followersCount: apiResult.json?.followersCount,
          followsCount: apiResult.json?.followsCount,
        };
        const matches = Object.entries(expected).every(([key, value]) =>
          lastRendered?.[key] === value && lastApi?.[key] === value);
        if (matches) {
          return {
            rendered: lastRendered,
            api: lastApi,
          };
        }
      }
      await wait(page, 2000);
    }

    throw new Error(
      `profile counts for ${profileHandle} did not converge; expected=${JSON.stringify(expected)} rendered=${JSON.stringify(lastRendered)} api=${JSON.stringify(lastApi)}`,
    );
  };

  const readProfileCountsAfterReload = async (page, viewerAccount, profileHandle) => {
    await gotoProfile(page, profileHandle);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(page, 3000);
    await waitForProfileHandle(page, profileHandle);
    const rendered = await readRenderedProfileCounts(page);
    const apiResult = await xrpcJson('app.bsky.actor.getProfile', {
      token: viewerAccount?.accessJwt,
      params: { actor: profileHandle },
      timeoutMs: 15000,
    });
    if (!apiResult.ok) {
      throw new Error(`failed to read profile counts for ${profileHandle}`);
    }
    return {
      rendered,
      api: {
        followersCount: apiResult.json?.followersCount,
        followsCount: apiResult.json?.followsCount,
      },
    };
  };

  const composePost = async (page, text) => {
    await page.locator('[aria-label="Compose new post"]').last().click({ noWaitAfter: true });
    await wait(page, 800);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    await wait(page, 300);
    await page.getByRole('button', { name: 'Publish post' }).click({ noWaitAfter: true });
    await wait(page, 4000);
  };

  const uploadComposerMedia = async (page) => {
    const mediaFile = await ensureAvatarFixture();
    const openMedia = page.getByTestId('openMediaBtn').last();
    if (!(await openMedia.count())) {
      throw new Error('composer media button unavailable');
    }
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
    await openMedia.click({ noWaitAfter: true });
    const chooser = await chooserPromise;
    await chooser.setFiles(mediaFile);
    await wait(page, 2000);
    return mediaFile;
  };

  const composePostWithImage = async (page, text) => {
    await page.locator('[aria-label="Compose new post"]').last().click({ noWaitAfter: true });
    await wait(page, 800);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    const mediaFile = await uploadComposerMedia(page);
    await wait(page, 500);
    await page.getByRole('button', { name: 'Publish post' }).click({ noWaitAfter: true });
    await wait(page, 5000);
    return { mediaFile };
  };

  const dismissModalBackdropIfPresent = async (page) => {
    const backdrop = page.locator('[aria-label*="click to close"]').last();
    if (await backdrop.count()) {
      await backdrop.click({ force: true, noWaitAfter: true }).catch(() => undefined);
      await wait(page, 400);
    }
  };

  const uploadProfileAvatar = async (page) => {
    const avatarFile = await ensureAvatarFixture();
    let fileInputs = page.locator('input[type="file"]');
    let count = await fileInputs.count();

    if (count === 0) {
      const changeAvatar = page.getByTestId('changeAvatarBtn').first();
      if (await changeAvatar.count()) {
        await changeAvatar.click({ noWaitAfter: true });
        await wait(page, 500);
        const uploadFromFiles = page.getByTestId('changeAvatarLibraryBtn').first();
        if (await uploadFromFiles.count()) {
          const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
          await uploadFromFiles.click({ noWaitAfter: true });
          const chooser = await chooserPromise;
          await chooser.setFiles(avatarFile);
          await wait(page, 750);
          const editImageHeading = page.getByText(/^Edit image$/).last();
          if (await editImageHeading.count()) {
            await editImageHeading.waitFor({ state: 'visible', timeout: 10000 });
            const cropSave = page.getByRole('button', { name: 'Save' }).last();
            await cropSave.click({ noWaitAfter: true });
            await editImageHeading.waitFor({ state: 'hidden', timeout: 15000 });
          }
          await wait(page, 1500);
          return avatarFile;
        }
      }
    }

    if (count === 0) {
      throw new Error('profile avatar file input unavailable');
    }

    await fileInputs.first().setInputFiles(avatarFile);
    await wait(page, 1500);
    return avatarFile;
  };

  const editProfile = async (page, account) => {
    const edit = page.getByRole('button', { name: /edit profile/i });
    if (!(await edit.count())) {
      throw new Error(`edit profile button unavailable for ${account.handle}`);
    }
    await edit.click({ noWaitAfter: true });
    await wait(page, 1000);
    await dismissModalBackdropIfPresent(page);
    const avatarFile = await uploadProfileAvatar(page);
    const bioField = page.locator('textarea[aria-label="Description"]').first();
    if (await bioField.count()) {
      await bioField.fill(account.profileNote);
      const actual = await bioField.inputValue();
      if (actual !== account.profileNote) {
        throw new Error(`profile description fill did not stick for ${account.handle}: ${actual}`);
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
    await wait(page, 3000);
    return { avatarFile, profileNote: account.profileNote };
  };

  const verifyLocalProfileAfterEdit = async (account) => {
    const didResult = await xrpcJson('com.atproto.identity.resolveHandle', {
      params: { handle: account.handle },
    });
    if (!didResult.ok || didResult.json?.did !== account.did) {
      throw new Error(`handle did mismatch for ${account.handle}`);
    }
    const result = await xrpcJson('com.atproto.repo.getRecord', {
      params: {
        repo: account.did,
        collection: 'app.bsky.actor.profile',
        rkey: 'self',
      },
    });
    if (!result.ok) {
      throw new Error(`profile record lookup failed for ${account.handle}: ${result.status} ${result.text}`);
    }
    const avatarCid = result.json?.value?.avatar?.ref?.$link;
    const description = result.json?.value?.description;
    if (description !== account.profileNote || typeof avatarCid !== 'string' || !avatarCid.length) {
      throw new Error(`profile record did not contain expected avatar/description for ${account.handle}`);
    }
    return { avatarCid, description };
  };

  const verifyPublicProfileAfterEdit = async (account) => {
    const started = Date.now();
    let result;
    while (Date.now() - started < (config.publicCheckTimeoutMs ?? 180000)) {
      result = await fetchJson(
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(account.handle)}`,
      );
      if (
        result.ok &&
        result.json?.description === account.profileNote &&
        typeof result.json?.avatar === 'string' &&
        result.json.avatar.length > 0
      ) {
        break;
      }
      await sleep(5000);
    }
    if (!result?.ok) {
      throw new Error(`public profile lookup failed for ${account.handle}: ${result?.status} ${result?.text}`);
    }
    if (result.json?.description !== account.profileNote || typeof result.json?.avatar !== 'string') {
      throw new Error(`public profile missing updated description/avatar for ${account.handle}`);
    }
    const avatarResult = await fetchStatus(result.json.avatar);
    if (!avatarResult.ok) {
      throw new Error(`public avatar URL returned ${avatarResult.status} for ${account.handle}`);
    }
    return {
      avatar: result.json.avatar,
      avatarStatus: avatarResult.status,
      description: result.json.description,
    };
  };

  const findRowByPrimaryText = async (page, needle, timeout = 60000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const rows = page.locator('[data-testid^="feedItem-by-"]');
      const count = await rows.count();
      for (let i = 0; i < count; i += 1) {
        const row = rows.nth(i);
        const primaryText = row.locator('[data-testid="postText"]').first();
        if (!(await primaryText.count())) {
          continue;
        }
        const text = normalizeText(await primaryText.textContent());
        if (text === needle) {
          await row.waitFor({ state: 'visible', timeout: 10000 });
          return row;
        }
      }
      await wait(page, 1000);
    }
    throw new Error(`feed item with primary text not found: ${needle}`);
  };

  const maybeFindRowByPrimaryText = async (page, needle, timeout = 10000) => {
    try {
      return await findRowByPrimaryText(page, needle, timeout);
    } catch {
      return null;
    }
  };

  const findFirstFeedItem = async (page, timeout = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const rows = page.locator('[data-testid^="feedItem-by-"]');
      const count = await rows.count();
      if (count > 0) {
        const row = rows.first();
        await row.waitFor({ state: 'visible', timeout: 10000 });
        return row;
      }
      await wait(page, 500);
    }
    throw new Error('feed item not found');
  };

  const clickLike = async (page, row) => {
    const btn = row.getByTestId('likeBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(page, 1500);
  };

  const ensureLiked = async (page, row) => {
    const btn = row.getByTestId('likeBtn').first();
    const before = await buttonText(btn);
    if (/unlike/i.test(before)) {
      return { note: 'already liked' };
    }
    await clickLike(page, row);
    return { note: await buttonText(btn) };
  };

  const ensureNotLiked = async (page, row) => {
    const btn = row.getByTestId('likeBtn').first();
    const before = await buttonText(btn);
    if (!/unlike/i.test(before)) {
      return { note: 'already not liked' };
    }
    await clickLike(page, row);
    return { note: await buttonText(btn) };
  };

  const dismissBlockingOverlays = async (page) => {
    const backdrop = page.locator('[aria-label*="click to close"]').last();
    if (await backdrop.count()) {
      await backdrop.click({ force: true, noWaitAfter: true }).catch(() => undefined);
      await wait(page, 400);
    }

    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
    if (await dialog.count()) {
      const close = dialog.getByRole('button', { name: /close/i }).last();
      if (await close.count()) {
        await close.click({ noWaitAfter: true }).catch(() => undefined);
        await wait(page, 400);
      }
      await page.keyboard.press('Escape').catch(() => undefined);
      await wait(page, 400);
    }
  };

  const clickRepost = async (page, row) => {
    await dismissBlockingOverlays(page);
    const btn = row.getByTestId('repostBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(page, 500);
    const repost = page.getByText(/^Repost$/).last();
    if (await repost.count()) {
      await repost.click({ noWaitAfter: true });
      await wait(page, 1500);
      await dismissBlockingOverlays(page);
    }
  };

  const ensureReposted = async (page, row) => {
    const btn = row.getByTestId('repostBtn').first();
    const before = await buttonText(btn);
    if (/undo repost|remove repost/i.test(before)) {
      return { note: 'already reposted' };
    }
    await clickRepost(page, row);
    return { note: await buttonText(btn) };
  };

  const ensureNotReposted = async (page, row) => {
    const btn = row.getByTestId('repostBtn').first();
    const before = await buttonText(btn);
    if (!/undo repost|remove repost/i.test(before)) {
      return { note: 'already not reposted' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(page, 1500);
    return { note: await buttonText(btn) };
  };

  const ensureBookmarked = async (page, row) => {
    const btn = row.getByTestId('postBookmarkBtn').first();
    const before = await buttonText(btn);
    if (/remove from saved posts/i.test(before)) {
      return { note: 'already bookmarked' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(page, 1500);
    return { note: await buttonText(btn) };
  };

  const ensureNotBookmarked = async (page, row) => {
    const btn = row.getByTestId('postBookmarkBtn').first();
    const before = await buttonText(btn);
    if (!/remove from saved posts/i.test(before)) {
      return { note: 'already not bookmarked' };
    }
    await btn.click({ noWaitAfter: true });
    await wait(page, 1500);
    return { note: await buttonText(btn) };
  };

  const visibleEditorLocator = (page) =>
    page.locator(
      [
        '[aria-label="Rich-Text Editor"]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][aria-multiline="true"]',
      ].join(', '),
    );

  const waitForVisibleEditor = async (page, timeout = 20000) => {
    const editors = visibleEditorLocator(page);
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const count = await editors.count();
      for (let i = count - 1; i >= 0; i -= 1) {
        const editor = editors.nth(i);
        if (await editor.isVisible().catch(() => false)) {
          return editor;
        }
      }
      await wait(page, 250);
    }
    throw new Error('visible rich-text editor not found');
  };

  const firstVisibleLocator = async (locator) => {
    const count = await locator.count();
    for (let i = count - 1; i >= 0; i -= 1) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
    return null;
  };

  const publishComposer = async (page, text, { applyWritesLabel, publishLabel }) => {
    const editor = await waitForVisibleEditor(page);
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);

    const publish = page.getByTestId('composerPublishBtn').last();
    await publish.waitFor({ state: 'visible', timeout: 15000 });
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/xrpc/com.atproto.repo.applyWrites') &&
        res.request().method() === 'POST',
      { timeout: 30000 },
    );
    await publish.click({ noWaitAfter: true });
    const response = await responsePromise;
    if (response.status() !== 200) {
      throw new Error(`${applyWritesLabel} failed with status ${response.status()}`);
    }
    await wait(page, 4000);

    const buttonName = publishLabel instanceof RegExp ? publishLabel : /publish/i;
    await page.getByTestId('composerPublishBtn').getByRole('button', { name: buttonName }).waitFor({
      state: 'detached',
      timeout: 15000,
    }).catch(() => undefined);
  };

  const clickQuote = async (page, row, text) => {
    await dismissBlockingOverlays(page);
    const btn = row.getByTestId('repostBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(page, 500);
    const quote = page.getByText(/^Quote post$/).last();
    if (!(await quote.count())) {
      throw new Error('quote option not available');
    }
    await quote.click({ noWaitAfter: true });
    await publishComposer(page, text, {
      applyWritesLabel: 'quote publish',
      publishLabel: /publish post/i,
    });
    await dismissBlockingOverlays(page);
  };

  const clickReply = async (page, row, text) => {
    const openReplyComposer = async (scope) => {
      const editor = await waitForVisibleEditor(page, 750).catch(() => null);
      if (editor) {
        return true;
      }

      const composeReply = await firstVisibleLocator(page.getByRole('button', { name: /compose reply/i }));
      if (composeReply) {
        await composeReply.click({ noWaitAfter: true });
        await wait(page, 500);
        const afterComposeClick = await waitForVisibleEditor(page, 2000).catch(() => null);
        if (afterComposeClick) {
          return true;
        }
      }

      const writeYourReply = await firstVisibleLocator(page.getByText(/Write your reply/i));
      if (writeYourReply) {
        await writeYourReply.click({ noWaitAfter: true, force: true });
        await wait(page, 500);
        const afterInlineClick = await waitForVisibleEditor(page, 2000).catch(() => null);
        if (afterInlineClick) {
          return true;
        }
      }

      const btn = await firstVisibleLocator(scope.getByTestId('replyBtn'));
      if (!btn) {
        return false;
      }

      await btn.scrollIntoViewIfNeeded().catch(() => undefined);
      await btn.click({ noWaitAfter: true, force: true });
      await wait(page, 1000);
      await dismissBlockingOverlays(page);
      return true;
    };

    await dismissBlockingOverlays(page);

    await openReplyComposer(row);
    const firstAttempt = await waitForVisibleEditor(page, 4000).catch(() => null);
    if (!firstAttempt) {
      const postText = row.getByTestId('postText').first();
      if (await postText.count()) {
        await postText.click({ noWaitAfter: true, force: true }).catch(() => undefined);
        await wait(page, 1500);
        await dismissBlockingOverlays(page);
      }
      await openReplyComposer(page);
    }

    await publishComposer(page, text, {
      applyWritesLabel: 'reply publish',
      publishLabel: /publish reply|reply/i,
    });
    await dismissBlockingOverlays(page);
  };

  const openProfileMenu = async (page) => {
    const btn = page.getByTestId('profileHeaderDropdownBtn').first();
    await btn.waitFor({ state: 'visible', timeout: 15000 });
    await btn.click({ noWaitAfter: true });
    const menu = page.locator('[role="menu"]').last();
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    return menu;
  };

  const menuItems = async (page) =>
    page.locator('[role="menuitem"]').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
    );

  const closeActiveMenu = async (page) => {
    const backdrop = page.locator('[aria-label*="backdrop"]').last();
    if (await backdrop.count()) {
      await backdrop.click({ force: true, noWaitAfter: true }).catch(() => undefined);
      await wait(page, 400);
      return;
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await wait(page, 400);
  };

  const ensureProfileMuted = async (page) => {
    await openProfileMenu(page);
    const items = await menuItems(page);
    if (items.some((item) => /unmute account/i.test(item))) {
      await closeActiveMenu(page);
      return { note: 'already muted' };
    }
    await page.getByRole('menuitem', { name: /mute account/i }).click({ noWaitAfter: true });
    await wait(page, 1500);
    await openProfileMenu(page);
    const after = await menuItems(page);
    await closeActiveMenu(page);
    if (!after.some((item) => /unmute account/i.test(item))) {
      throw new Error('mute account did not switch menu state');
    }
    return { note: 'muted account' };
  };

  const ensureProfileUnmuted = async (page) => {
    await openProfileMenu(page);
    const items = await menuItems(page);
    if (!items.some((item) => /unmute account/i.test(item))) {
      await closeActiveMenu(page);
      return { note: 'already unmuted' };
    }
    await page.getByRole('menuitem', { name: /unmute account/i }).click({ noWaitAfter: true });
    await wait(page, 1500);
    await openProfileMenu(page);
    const after = await menuItems(page);
    await closeActiveMenu(page);
    if (!after.some((item) => /mute account/i.test(item))) {
      throw new Error('unmute account did not restore menu state');
    }
    return { note: 'unmuted account' };
  };

  const blockProfile = async (page) => {
    await openProfileMenu(page);
    const items = await menuItems(page);
    if (items.some((item) => /unblock account/i.test(item))) {
      await closeActiveMenu(page);
      return { note: 'already blocked' };
    }
    await page.getByRole('menuitem', { name: /block account/i }).click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await dialog.getByRole('button', { name: /^Block$/i }).click({ noWaitAfter: true });
    await wait(page, 2500);
    const unblock = page.getByRole('button', { name: /unblock/i }).first();
    if (!(await unblock.count())) {
      throw new Error('block account did not expose an unblock button');
    }
    return { note: 'blocked account' };
  };

  const unblockProfile = async (page) => {
    const unblock = page.getByRole('button', { name: /unblock/i }).first();
    if (!(await unblock.count())) {
      return { note: 'already unblocked' };
    }
    await unblock.click({ noWaitAfter: true });
    await wait(page, 1000);
    const dialog = page.locator('[role="dialog"]').last();
    const confirm = dialog.getByRole('button', { name: /unblock/i }).last();
    if (await confirm.count()) {
      await confirm.click({ noWaitAfter: true });
    }
    await wait(page, 1500);
    const blockedBadge = page.getByText(/user blocked/i).first();
    if (await blockedBadge.count()) {
      throw new Error('profile still appears blocked after unblock');
    }
    return { note: 'unblocked account' };
  };

  const openPostOptions = async (page, row) => {
    const btn = row.getByTestId('postDropdownBtn').first();
    await btn.click({ noWaitAfter: true });
    const menu = page.locator('[role="menu"]').last();
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    return menu;
  };

  const openReportPostDraft = async (page, row) => {
    await openPostOptions(page, row);
    await page.getByRole('menuitem', { name: /report post/i }).click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await dialog.getByRole('button', { name: /create report for other/i }).click({ noWaitAfter: true });
    await wait(page, 1000);
    const submit = dialog.getByRole('button', { name: /submit report/i }).last();
    await submit.waitFor({ state: 'visible', timeout: 10000 });
    const body = normalizeText(await dialog.textContent());
    const close = dialog.getByRole('button', { name: /close active dialog/i }).last();
    if (await close.count()) {
      await close.click({ noWaitAfter: true });
    } else {
      await page.keyboard.press('Escape').catch(() => undefined);
    }
    await wait(page, 1000);
    return {
      note: 'opened report draft without submitting',
      submitVisible: true,
      body,
    };
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

  const waitForNotificationsFeed = async (page) => {
    const feed = page.getByTestId('notifsFeed').first();
    if (await feed.count()) {
      await feed.waitFor({ state: 'visible', timeout: 15000 });
      return feed;
    }
    return null;
  };

  const openProfileTab = async (page, name) => {
    const tab = page.getByRole('tab', { name }).first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click({ noWaitAfter: true });
    await wait(page, 2000);
  };

  const deletePostRow = async (page, row) => {
    await openPostOptions(page, row);
    const deleteItem = page.getByRole('menuitem', { name: /delete post/i }).first();
    await deleteItem.waitFor({ state: 'visible', timeout: 10000 });
    await deleteItem.click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const confirm = page.getByRole('button', { name: /^Delete$/i }).last();
    await confirm.click({ noWaitAfter: true });
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await wait(page, 3000);
  };

  const maybeDeleteOwnPostByText = async (page, text, successNote) => {
    const row = await maybeFindRowByPrimaryText(page, text, 10000);
    if (!row) {
      return { note: `not surfaced for cleanup: ${text}` };
    }
    await deletePostRow(page, row);
    return { note: successNote };
  };

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    waitForProfileHandle,
    verifyProfileCountsAfterReload,
    readProfileCountsAfterReload,
    findFirstFeedItem,
    composePost,
    composePostWithImage,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
    findRowByPrimaryText,
    ensureLiked,
    ensureNotLiked,
    ensureReposted,
    ensureNotReposted,
    ensureBookmarked,
    ensureNotBookmarked,
    clickQuote,
    clickReply,
    maybeFollow,
    maybeUnfollow,
    openNotifications,
    openSavedPosts,
    waitForNotificationsFeed,
    ensureProfileMuted,
    ensureProfileUnmuted,
    blockProfile,
    unblockProfile,
    openReportPostDraft,
    openProfileTab,
    maybeDeleteOwnPostByText,
    openListProfile: gotoProfile,
  };
};
