import { loginToBlueskyApp } from '../runtime-utils.mjs';
import { createPageAuthActions } from '../page-auth-actions.mjs';

export const createSingleAuthActions = ({
  config,
  summary,
  page,
  appBaseUrl,
  wait,
}) => {
  const actions = createPageAuthActions({
    appUrl: config.appUrl,
    appBaseUrl,
    wait: (_page, ms) => wait(ms),
    loginToBlueskyApp,
  });

  const login = async () => {
    const loginIdentifier = config.loginIdentifier || config.handle;
    await actions.login(page, {
      pdsHost: config.pdsHost,
      loginIdentifier,
      password: config.password,
      notes: summary.notes,
      noteTarget: config.handle,
    });
  };

  const completeAgeAssuranceIfNeeded = async () =>
    actions.completeAgeAssuranceIfNeeded(page, {
      birthdate: config.birthdate,
      notes: summary.notes,
      noteText: 'Completed age-assurance birthdate gate',
    });

  const gotoProfile = (handle) => actions.gotoProfile(page, handle);

  const waitForProfileHandle = (handle, timeout) =>
    actions.waitForProfileHandle(page, handle, timeout);

  const maybeFollowTarget = () => actions.maybeFollow(page);

  const maybeUnfollowTarget = () => actions.maybeUnfollow(page);

  const openNotifications = () => actions.openNotifications(page);

  const openSavedPosts = () => actions.openSavedPosts(page);

  const openProfileTab = (name) => actions.openProfileTab(page, name);

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
