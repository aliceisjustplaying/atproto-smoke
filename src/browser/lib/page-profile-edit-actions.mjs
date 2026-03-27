import fs from 'node:fs/promises';
import path from 'node:path';

export const createPageProfileEditActions = ({
  artifactsDir,
  wait,
  dismissBlockingOverlays,
  avatarPngBase64,
  notes,
}) => {
  const ensureAvatarFixture = async () => {
    const file = path.join(artifactsDir, 'avatar-fixture.png');
    await fs.writeFile(file, Buffer.from(avatarPngBase64, 'base64'));
    return file;
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
            if (Array.isArray(notes)) {
              notes.push('profile avatar crop saved');
            }
          }
          if (Array.isArray(notes)) {
            notes.push('profile avatar uploaded via file chooser');
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
    if (Array.isArray(notes)) {
      notes.push(`edit profile file inputs: ${count}`);
    }
    return avatarFile;
  };

  const editProfile = async (page, { profileNote, handle }) => {
    const edit = page.getByRole('button', { name: /edit profile/i });
    if (!(await edit.count())) {
      const detail = handle ? ` for ${handle}` : '';
      throw new Error(`edit profile button unavailable${detail}`);
    }
    await edit.click({ noWaitAfter: true });
    await wait(page, 1000);
    await dismissBlockingOverlays(page);
    const avatarFile = await uploadProfileAvatar(page);
    const bioField = page.locator('textarea[aria-label="Description"]').first();
    if (await bioField.count()) {
      await bioField.fill(profileNote);
      const actual = await bioField.inputValue();
      if (actual !== profileNote) {
        const detail = handle ? ` for ${handle}` : '';
        throw new Error(`profile description fill did not stick${detail}: ${actual}`);
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
    return { avatarFile, profileNote };
  };

  return {
    ensureAvatarFixture,
    uploadProfileAvatar,
    editProfile,
  };
};
