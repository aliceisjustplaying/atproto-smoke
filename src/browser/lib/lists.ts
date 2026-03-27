export const createListHelpers = ({ appBaseUrl, wait }) => {
  const waitForListPageReady = async (page, timeout = 30000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const moreOptions = page.getByTestId("moreOptionsBtn").first();
      if (await moreOptions.isVisible().catch(() => false)) {
        return;
      }
      await wait(page, 1500);
      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 60000 })
        .catch(() => undefined);
      await wait(page, 2000);
    }
    throw new Error("list page did not become interactive");
  };

  const openLists = async (page) => {
    await page.goto(`${appBaseUrl}/lists`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await wait(page, 3000);
    const newList = page.getByTestId("newUserListBtn").first();
    if (await newList.count()) {
      await newList.waitFor({ state: "visible", timeout: 15000 });
    }
  };

  const openListPage = async (page, handle, listRkey) => {
    await page.goto(
      `${appBaseUrl}/profile/${encodeURIComponent(handle)}/lists/${encodeURIComponent(listRkey)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      },
    );
    await wait(page, 3000);
    await waitForListPageReady(page);
  };

  const fillListEditor = async (page, name, description) => {
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: "visible", timeout: 15000 });
    await dialog.getByTestId("editListNameInput").fill(name);
    await dialog.getByTestId("editListDescriptionInput").fill(description);
    return dialog;
  };

  const saveListEditor = async (page) => {
    const dialog = page.locator('[role="dialog"]').last();
    const save = dialog.getByTestId("editProfileSaveBtn").last();
    await save.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(
          '[data-testid="editProfileSaveBtn"]',
        );
        if (!(btn instanceof HTMLElement)) {
          return false;
        }
        return (
          !btn.hasAttribute("disabled") &&
          btn.getAttribute("aria-disabled") !== "true"
        );
      },
      undefined,
      { timeout: 15000 },
    );
    await save.click({ noWaitAfter: true });
    await dialog.waitFor({ state: "hidden", timeout: 20000 });
    await wait(page, 3000);
  };

  const createList = async (page, name, description) => {
    await openLists(page);
    await page
      .getByTestId("newUserListBtn")
      .first()
      .click({ noWaitAfter: true });
    await wait(page, 1000);
    await fillListEditor(page, name, description);
    await saveListEditor(page);
    await wait(page, 3000);
    return { url: page.url() };
  };

  const openCurrentListOptions = async (page) => {
    const btn = page.getByTestId("moreOptionsBtn").first();
    await btn.waitFor({ state: "visible", timeout: 15000 });
    await btn.click({ noWaitAfter: true });
    const menu = page.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    return menu;
  };

  const editCurrentList = async (page, name, description) => {
    await openCurrentListOptions(page);
    await page
      .getByRole("menuitem", { name: /edit list details/i })
      .click({ noWaitAfter: true });
    await wait(page, 800);
    await fillListEditor(page, name, description);
    await saveListEditor(page);
    await wait(page, 2000);
    return { listName: name, listDescription: description };
  };

  const deleteCurrentList = async (page) => {
    const beforeUrl = page.url();
    await openCurrentListOptions(page);
    await page
      .getByRole("menuitem", { name: /delete list/i })
      .click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: "visible", timeout: 15000 });
    const confirm = dialog.getByRole("button", { name: /^delete$/i }).last();
    await confirm.click({ noWaitAfter: true });
    await dialog.waitFor({ state: "hidden", timeout: 20000 });
    await page.waitForFunction(
      (url) =>
        window.location.href !== url &&
        !/\/lists\/[^/?#]+/.test(window.location.pathname),
      beforeUrl,
      { timeout: 20000 },
    );
    await wait(page, 3000);
    return { url: page.url() };
  };

  const openListPeopleTab = async (page) => {
    await page
      .getByRole("tab", { name: /^People$/i })
      .click({ noWaitAfter: true });
    await wait(page, 1500);
  };

  const openAddPeopleToList = async (page) => {
    await openListPeopleTab(page);
    const add = page
      .getByRole("button", { name: /start adding people|add people/i })
      .last();
    await add.waitFor({ state: "visible", timeout: 15000 });
    await add.click({ noWaitAfter: true });
    await page
      .getByText(/^Add people to list$/i)
      .last()
      .waitFor({ state: "visible", timeout: 15000 });
    await wait(page, 1000);
  };

  const closeAddPeopleToList = async (page) => {
    const close = page.getByRole("button", { name: /^close$/i }).last();
    if (await close.count()) {
      await close.click({ noWaitAfter: true }).catch(() => undefined);
    } else {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    await wait(page, 1000);
  };

  const searchAddPeopleList = async (page, handle) => {
    const search = page.getByPlaceholder("Search").last();
    await search.fill(handle.replace(/^@/, ""));
    await wait(page, 2500);
    await page
      .getByText(`@${handle.replace(/^@/, "")}`)
      .last()
      .waitFor({ state: "visible", timeout: 15000 });
  };

  const addUserToCurrentList = async (page, handle) => {
    await openAddPeopleToList(page);
    await searchAddPeopleList(page, handle);
    const add = page.getByRole("button", { name: /add user to list/i }).last();
    if (!(await add.count())) {
      const shortHandle = handle.replace(/^@/, "");
      const profileLink = page
        .locator('[role="dialog"]')
        .last()
        .getByRole("link", {
          name: new RegExp(
            `@?${shortHandle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            "i",
          ),
        })
        .last();
      if (await profileLink.count()) {
        throw new Error(
          `search result for @${shortHandle} rendered in "Add people to list" modal, but no add action was available`,
        );
      }
      throw new Error(
        `no add action was available for @${shortHandle} in "Add people to list" modal`,
      );
    }
    await add.click({ noWaitAfter: true });
    await wait(page, 2000);
    const remove = page
      .getByRole("button", { name: /remove user from list/i })
      .last();
    await remove.waitFor({ state: "visible", timeout: 15000 });
    await closeAddPeopleToList(page);
    await page
      .getByText(`@${handle.replace(/^@/, "")}`)
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    return { handle };
  };

  const removeUserFromCurrentList = async (page, handle) => {
    await openListPeopleTab(page);
    const edit = page.getByTestId(`user-${handle}-editBtn`).first();
    await edit.waitFor({ state: "visible", timeout: 15000 });
    await edit.click({ noWaitAfter: true });
    await wait(page, 1000);
    let remove = page.getByTestId(`user-${handle}-addBtn`).first();
    if (!(await remove.count())) {
      remove = page.getByRole("button", { name: /^remove$/i }).last();
    }
    await remove.click({ noWaitAfter: true });
    await wait(page, 2000);
    const done = page.getByRole("button", { name: /^done$/i }).last();
    if (await done.count()) {
      await done.click({ noWaitAfter: true });
      await wait(page, 1000);
    }
    return { handle };
  };

  return {
    openListPage,
    createList,
    editCurrentList,
    deleteCurrentList,
    addUserToCurrentList,
    removeUserFromCurrentList,
  };
};
