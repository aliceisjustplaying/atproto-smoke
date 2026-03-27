export const createSingleFeedActions = ({
  page,
  wait,
  normalizeText,
  buttonText,
}) => {
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
    const handleText = `@${shortHandle}`;
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

  const clickRepost = async (row, actionPattern = /^Repost$/i) => {
    const btn = row.getByTestId('repostBtn').first();
    await btn.click({ noWaitAfter: true });
    await wait(500);
    const repost = page.getByText(actionPattern).last();
    if (await repost.count()) {
      await repost.click({ noWaitAfter: true });
      await wait(1500);
      return;
    }
    await wait(1500);
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
    await clickRepost(row, /^(?:Undo repost|Remove repost)$/i);
    return { note: await buttonText(btn) };
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

  return {
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
    maybeDeleteOwnPostByText,
  };
};
