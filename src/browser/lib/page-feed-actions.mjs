export const createPageFeedActions = ({
  wait,
  normalizeText,
  buttonText,
  dismissBlockingOverlays,
}) => {
  const composePost = async (page, text) => {
    await page
      .locator('[aria-label="Compose new post"]')
      .last()
      .click({ noWaitAfter: true });
    await wait(page, 800);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    await wait(page, 300);
    await page
      .getByRole("button", { name: "Publish post" })
      .click({ noWaitAfter: true });
    await wait(page, 4000);
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
          await row.waitFor({ state: "visible", timeout: 10000 });
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
        await row.waitFor({ state: "visible", timeout: 10000 });
        return row;
      }
      await wait(page, 500);
    }
    throw new Error("feed item not found");
  };

  const clickLike = async (page, row) => {
    const btn = row.getByTestId("likeBtn").first();
    await btn.click({ noWaitAfter: true });
    await wait(page, 1500);
  };

  const clickRepost = async (page, row, actionPattern = /^Repost$/i) => {
    await dismissBlockingOverlays(page);
    const btn = row.getByTestId("repostBtn").first();
    await btn.click({ noWaitAfter: true });
    await wait(page, 500);
    const repost = page.getByText(actionPattern).last();
    if (await repost.count()) {
      await repost.click({ noWaitAfter: true });
      await wait(page, 1500);
      await dismissBlockingOverlays(page);
      return;
    }
    await wait(page, 1500);
  };

  const ensureLiked = async (page, row) => {
    const btn = row.getByTestId("likeBtn").first();
    const before = await buttonText(btn);
    if (/unlike/i.test(before)) {
      return { note: "already liked" };
    }
    await clickLike(page, row);
    return { note: await buttonText(btn) };
  };

  const ensureNotLiked = async (page, row) => {
    const btn = row.getByTestId("likeBtn").first();
    const before = await buttonText(btn);
    if (!/unlike/i.test(before)) {
      return { note: "already not liked" };
    }
    await clickLike(page, row);
    return { note: await buttonText(btn) };
  };

  const ensureReposted = async (page, row) => {
    const btn = row.getByTestId("repostBtn").first();
    const before = await buttonText(btn);
    if (/undo repost|remove repost/i.test(before)) {
      return { note: "already reposted" };
    }
    await clickRepost(page, row);
    return { note: await buttonText(btn) };
  };

  const ensureNotReposted = async (page, row) => {
    const btn = row.getByTestId("repostBtn").first();
    const before = await buttonText(btn);
    if (!/undo repost|remove repost/i.test(before)) {
      return { note: "already not reposted" };
    }
    await clickRepost(page, row, /^(?:Undo repost|Remove repost)$/i);
    return { note: await buttonText(btn) };
  };

  const ensureBookmarked = async (page, row) => {
    const btn = row.getByTestId("postBookmarkBtn").first();
    const before = await buttonText(btn);
    if (/remove from saved posts/i.test(before)) {
      return { note: "already bookmarked" };
    }
    await btn.click({ noWaitAfter: true });
    await wait(page, 1500);
    return { note: await buttonText(btn) };
  };

  const ensureNotBookmarked = async (page, row) => {
    const btn = row.getByTestId("postBookmarkBtn").first();
    const before = await buttonText(btn);
    if (!/remove from saved posts/i.test(before)) {
      return { note: "already not bookmarked" };
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
      ].join(", "),
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
    throw new Error("visible rich-text editor not found");
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

  const publishComposer = async (
    page,
    text,
    { applyWritesLabel, publishLabel },
  ) => {
    const editor = await waitForVisibleEditor(page);
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);

    const publish = page.getByTestId("composerPublishBtn").last();
    await publish.waitFor({ state: "visible", timeout: 15000 });
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/xrpc/com.atproto.repo.applyWrites") &&
        res.request().method() === "POST",
      { timeout: 30000 },
    );
    await publish.click({ noWaitAfter: true });
    const response = await responsePromise;
    if (response.status() !== 200) {
      throw new Error(
        `${applyWritesLabel} failed with status ${response.status()}`,
      );
    }
    await wait(page, 4000);

    const buttonName =
      publishLabel instanceof RegExp ? publishLabel : /publish/i;
    await page
      .getByTestId("composerPublishBtn")
      .getByRole("button", { name: buttonName })
      .waitFor({
        state: "detached",
        timeout: 15000,
      })
      .catch(() => undefined);
  };

  const clickQuote = async (page, row, text) => {
    await dismissBlockingOverlays(page);
    const btn = row.getByTestId("repostBtn").first();
    await btn.click({ noWaitAfter: true });
    await wait(page, 500);
    const quote = page.getByText(/^Quote post$/).last();
    if (!(await quote.count())) {
      throw new Error("quote option not available");
    }
    await quote.click({ noWaitAfter: true });
    await publishComposer(page, text, {
      applyWritesLabel: "quote publish",
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

      const composeReply = await firstVisibleLocator(
        page.getByRole("button", { name: /compose reply/i }),
      );
      if (composeReply) {
        await composeReply.click({ noWaitAfter: true });
        await wait(page, 500);
        const afterComposeClick = await waitForVisibleEditor(page, 2000).catch(
          () => null,
        );
        if (afterComposeClick) {
          return true;
        }
      }

      const writeYourReply = await firstVisibleLocator(
        page.getByText(/Write your reply/i),
      );
      if (writeYourReply) {
        await writeYourReply.click({ noWaitAfter: true, force: true });
        await wait(page, 500);
        const afterInlineClick = await waitForVisibleEditor(page, 2000).catch(
          () => null,
        );
        if (afterInlineClick) {
          return true;
        }
      }

      const btn = await firstVisibleLocator(scope.getByTestId("replyBtn"));
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
    const firstAttempt = await waitForVisibleEditor(page, 4000).catch(
      () => null,
    );
    if (!firstAttempt) {
      const postText = row.getByTestId("postText").first();
      if (await postText.count()) {
        await postText
          .click({ noWaitAfter: true, force: true })
          .catch(() => undefined);
        await wait(page, 1500);
        await dismissBlockingOverlays(page);
      }
      await openReplyComposer(page);
    }

    await publishComposer(page, text, {
      applyWritesLabel: "reply publish",
      publishLabel: /publish reply|reply/i,
    });
    await dismissBlockingOverlays(page);
  };

  const openPostOptions = async (page, row) => {
    const btn = row.getByTestId("postDropdownBtn").first();
    await btn.click({ noWaitAfter: true });
    const menu = page.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    return menu;
  };

  const deletePostRow = async (page, row) => {
    await openPostOptions(page, row);
    const deleteItem = page
      .getByRole("menuitem", { name: /delete post/i })
      .first();
    await deleteItem.waitFor({ state: "visible", timeout: 10000 });
    await deleteItem.click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const confirm = page.getByRole("button", { name: /^Delete$/i }).last();
    await confirm.click({ noWaitAfter: true });
    await dialog.waitFor({ state: "hidden", timeout: 15000 });
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
    composePost,
    findRowByPrimaryText,
    maybeFindRowByPrimaryText,
    findFirstFeedItem,
    clickQuote,
    clickReply,
    ensureLiked,
    ensureNotLiked,
    ensureReposted,
    ensureNotReposted,
    ensureBookmarked,
    ensureNotBookmarked,
    openPostOptions,
    maybeDeleteOwnPostByText,
  };
};
