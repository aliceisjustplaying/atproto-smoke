import {
  dismissBlockingOverlays,
  loginToBlueskyApp,
  pollJsonUntil,
} from '../runtime-utils.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const createDualProfileActions = ({
  appBaseUrl,
  config,
  summary,
  wait,
  xrpcJson,
  fetchJson,
  fetchStatus,
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
    await loginToBlueskyApp({
      page,
      appUrl: config.appUrl,
      pdsHost: account.pdsHost || config.pdsHost,
      loginIdentifier,
      password: account.password,
    });
  };

  const completeAgeAssuranceIfNeeded = async (page, account) => {
    const addBirthdate = page.getByRole('button', { name: /(?:update|add) your birthdate/i });
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
    const handleText = `@${shortHandle}`;
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
      await waitForProfileHandle(page, profileHandle);
      lastRendered = await readRenderedProfileCounts(page);
      const apiResult = await xrpcJson('app.bsky.actor.getProfile', {
        token: viewerAccount?.accessJwt,
        pdsUrl: viewerAccount?.pdsUrl,
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

  const readProfileCountsAfterReload = async (page, viewerAccount, profileHandle, timeoutMs = 30000) => {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeoutMs) {
      try {
        await gotoProfile(page, profileHandle);
        await waitForProfileHandle(page, profileHandle);
        const rendered = await readRenderedProfileCounts(page);
        const apiResult = await xrpcJson('app.bsky.actor.getProfile', {
          token: viewerAccount?.accessJwt,
          pdsUrl: viewerAccount?.pdsUrl,
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
      } catch (error) {
        lastError = error;
        await wait(page, 2000);
      }
    }
    throw lastError || new Error(`failed to read profile counts for ${profileHandle}`);
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

  const uploadProfileAvatar = async (page) => {
    const avatarFile = await ensureAvatarFixture();
    const fileInputs = page.locator('input[type="file"]');
    const count = await fileInputs.count();

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
    await dismissBlockingOverlays(page);
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
      pdsUrl: account.pdsUrl,
      params: { handle: account.handle },
    });
    if (!didResult.ok || didResult.json?.did !== account.did) {
      throw new Error(`handle did mismatch for ${account.handle}`);
    }
    const result = await xrpcJson('com.atproto.repo.getRecord', {
      pdsUrl: account.pdsUrl,
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
    const result = await pollJsonUntil({
      name: `public profile edit indexing for ${account.handle}`,
      buildUrl: () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(account.handle)}`,
      predicate: ({ ok, json }) =>
        ok &&
        json?.description === account.profileNote &&
        typeof json?.avatar === 'string' &&
        json.avatar.length > 0,
      timeoutMs: config.publicCheckTimeoutMs ?? 180000,
      fetchJson,
    });
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

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    waitForProfileHandle,
    verifyProfileCountsAfterReload,
    readProfileCountsAfterReload,
    composePost,
    composePostWithImage,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
  };
};
