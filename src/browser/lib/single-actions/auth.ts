import type {
  PageAuthActions,
  SingleActions,
  SingleActionsOptions,
} from "../browser-types.js";
import { loginToBlueskyApp } from "../runtime-utils.js";
import { createPageAuthActions } from "../page-auth-actions.js";

export const createSingleAuthActions = ({
  config,
  summary,
  page,
  appBaseUrl,
  wait,
}: SingleActionsOptions): Pick<
  SingleActions,
  | "login"
  | "completeAgeAssuranceIfNeeded"
  | "gotoProfile"
  | "waitForProfileHandle"
  | "maybeFollowTarget"
  | "maybeUnfollowTarget"
  | "openNotifications"
  | "openSavedPosts"
  | "openProfileTab"
> => {
  const actions: PageAuthActions = createPageAuthActions({
    appUrl: config.appUrl,
    appBaseUrl,
    wait: (_page, ms) => wait(ms),
    loginToBlueskyApp,
  });

  const login = async (): Promise<void> => {
    const loginIdentifier = config.loginIdentifier ?? config.handle;
    await actions.login(page, {
      pdsHost: config.pdsHost,
      loginIdentifier,
      password: config.password,
      notes: summary.notes,
      noteTarget: config.handle,
    });
  };

  const completeAgeAssuranceIfNeeded = (): Promise<void> =>
    actions.completeAgeAssuranceIfNeeded(page, {
      birthdate: config.birthdate,
      notes: summary.notes,
      noteText: "Completed age-assurance birthdate gate",
    });

  const gotoProfile = (handle: string): Promise<void> =>
    actions.gotoProfile(page, handle);

  const waitForProfileHandle = (
    handle: string,
    timeout?: number,
  ): Promise<void> => actions.waitForProfileHandle(page, handle, timeout);

  const maybeFollowTarget = (): ReturnType<PageAuthActions["maybeFollow"]> =>
    actions.maybeFollow(page);

  const maybeUnfollowTarget = (): ReturnType<
    PageAuthActions["maybeUnfollow"]
  > => actions.maybeUnfollow(page);

  const openNotifications = (): Promise<void> =>
    actions.openNotifications(page);

  const openSavedPosts = (): Promise<void> => actions.openSavedPosts(page);

  const openProfileTab = (name: string): Promise<void> =>
    actions.openProfileTab(page, name);

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    waitForProfileHandle,
    maybeFollowTarget,
    maybeUnfollowTarget,
    openNotifications,
    openSavedPosts,
    openProfileTab,
  };
};
