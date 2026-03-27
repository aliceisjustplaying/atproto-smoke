import type { Locator, Page } from "playwright";
import type { DualActions, DualActionsOptions } from "../browser-types.js";

export const createDualModerationActions = ({
  wait,
}: DualActionsOptions): Pick<
  DualActions,
  | "ensureProfileMuted"
  | "ensureProfileUnmuted"
  | "blockProfile"
  | "unblockProfile"
> => {
  const openProfileMenu = async (page: Page): Promise<Locator> => {
    const btn = page.getByTestId("profileHeaderDropdownBtn").first();
    await btn.waitFor({ state: "visible", timeout: 15000 });
    await btn.click({ noWaitAfter: true });
    const menu = page.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    return menu;
  };

  const menuItems = (page: Page): Promise<string[]> =>
    page
      .locator('[role="menuitem"]')
      .evaluateAll((els) =>
        els
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean),
      );

  const closeActiveMenu = async (page: Page): Promise<void> => {
    const backdrop = page.locator('[aria-label*="backdrop"]').last();
    if (await backdrop.count()) {
      await backdrop
        .click({ force: true, noWaitAfter: true })
        .catch(() => undefined);
      await wait(page, 400);
      return;
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await wait(page, 400);
  };

  const ensureProfileMuted = async (
    page: Page,
  ): Promise<Record<string, string>> => {
    await openProfileMenu(page);
    const items = await menuItems(page);
    if (items.some((item) => /unmute account/i.test(item))) {
      await closeActiveMenu(page);
      return { note: "already muted" };
    }
    await page
      .getByRole("menuitem", { name: /mute account/i })
      .click({ noWaitAfter: true });
    await wait(page, 1500);
    await openProfileMenu(page);
    const after = await menuItems(page);
    await closeActiveMenu(page);
    if (!after.some((item) => /unmute account/i.test(item))) {
      throw new Error("mute account did not switch menu state");
    }
    return { note: "muted account" };
  };

  const ensureProfileUnmuted = async (
    page: Page,
  ): Promise<Record<string, string>> => {
    await openProfileMenu(page);
    const items = await menuItems(page);
    if (!items.some((item) => /unmute account/i.test(item))) {
      await closeActiveMenu(page);
      return { note: "already unmuted" };
    }
    await page
      .getByRole("menuitem", { name: /unmute account/i })
      .click({ noWaitAfter: true });
    await wait(page, 1500);
    await openProfileMenu(page);
    const after = await menuItems(page);
    await closeActiveMenu(page);
    if (!after.some((item) => /mute account/i.test(item))) {
      throw new Error("unmute account did not restore menu state");
    }
    return { note: "unmuted account" };
  };

  const blockProfile = async (page: Page): Promise<Record<string, string>> => {
    await openProfileMenu(page);
    const items = await menuItems(page);
    if (items.some((item) => /unblock account/i.test(item))) {
      await closeActiveMenu(page);
      return { note: "already blocked" };
    }
    await page
      .getByRole("menuitem", { name: /block account/i })
      .click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await dialog
      .getByRole("button", { name: /^Block$/i })
      .click({ noWaitAfter: true });
    await wait(page, 2500);
    const unblock = page.getByRole("button", { name: /unblock/i }).first();
    if (!(await unblock.count())) {
      throw new Error("block account did not expose an unblock button");
    }
    return { note: "blocked account" };
  };

  const unblockProfile = async (
    page: Page,
  ): Promise<Record<string, string>> => {
    const unblock = page.getByRole("button", { name: /unblock/i }).first();
    if (!(await unblock.count())) {
      return { note: "already unblocked" };
    }
    await unblock.click({ noWaitAfter: true });
    await wait(page, 1000);
    const dialog = page.locator('[role="dialog"]').last();
    const confirm = dialog.getByRole("button", { name: /unblock/i }).last();
    if (await confirm.count()) {
      await confirm.click({ noWaitAfter: true });
    }
    await wait(page, 1500);
    const blockedBadge = page.getByText(/user blocked/i).first();
    if (await blockedBadge.count()) {
      throw new Error("profile still appears blocked after unblock");
    }
    return { note: "unblocked account" };
  };

  return {
    ensureProfileMuted,
    ensureProfileUnmuted,
    blockProfile,
    unblockProfile,
  };
};
