import {
  dismissBlockingOverlays,
} from '../runtime-utils.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const createSingleProfileActions = ({
  config,
  summary,
  page,
  wait,
  fetchStatus,
  pollJson,
  avatarPngBase64,
}) => {
  const ensureAvatarFixture = async () => {
    const file = path.join(config.artifactsDir, 'avatar-fixture.png');
    await fs.writeFile(file, Buffer.from(avatarPngBase64, 'base64'));
    return file;
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

  const uploadProfileAvatar = async () => {
    const avatarFile = await ensureAvatarFixture();
    const fileInputs = page.locator('input[type="file"]');
    const count = await fileInputs.count();

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
    await dismissBlockingOverlays(page);
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
    verifyPublicHandleResolution,
    verifyPublicAuthorFeed,
    verifyPublicProfile,
    verifyPublicProfileAfterEdit,
    verifyLocalProfileAfterEdit,
    editProfile,
  };
};
