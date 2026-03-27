import { createRoleBasedAdapter } from "./adapter-builder.js";
import type { FlexibleRecord } from "../types.js";

export const PERLSKY_PRIMARY_CLEANUP_PREFIXES = Object.freeze([
  "perlsky browser smoke ",
]);

export const PERLSKY_SECONDARY_CLEANUP_PREFIXES = Object.freeze([
  "perlsky browser secondary ",
]);

export const PERLSKY_REMOTE_REPLY_POST_URL =
  "https://bsky.app/profile/alice.mosphere.at/post/3mgu5lgnsnk22";

const perlskyRoleDefaults = (role: string): FlexibleRecord => {
  if (role === "secondary") {
    return {
      postText: "perlsky browser secondary post",
      quoteText: "perlsky browser secondary quote",
      replyText: "perlsky browser secondary reply",
      profileNote: "perlsky browser secondary profile edit",
    };
  }

  return {
    postText: "perlsky browser smoke post",
    quoteText: "perlsky browser smoke quote",
    replyText: "perlsky browser smoke reply",
    profileNote: "perlsky browser smoke profile edit",
  };
};

const { adapter: PERLSKY_ADAPTER } = createRoleBasedAdapter({
  name: "perlsky",
  description:
    "Use perlsky-flavored defaults like cleanup prefixes and adapter tagging.",
  accountStrategy: "existing-accounts-or-bootstrap",
  notes: [
    "The standalone suite still expects credentials in the config.",
    "perlsky-specific account bootstrap and reusable-pair helpers live in perlsky, not in atproto-smoke itself.",
  ],
  exampleBase: {
    pdsUrl: "https://perlsky.mosphere.at",
    targetHandle: "alice.mosphere.at",
    strictErrors: true,
    remoteReplyPostUrl: PERLSKY_REMOTE_REPLY_POST_URL,
    primaryHandle: "smoke-primary.perlsky.mosphere.at",
    secondaryHandle: "smoke-secondary.perlsky.mosphere.at",
  },
  roleDefaults: perlskyRoleDefaults,
  primaryCleanupPrefixes: PERLSKY_PRIMARY_CLEANUP_PREFIXES,
  secondaryCleanupPrefixes: PERLSKY_SECONDARY_CLEANUP_PREFIXES,
  dualSuiteDefaults: {
    remoteReplyPostUrl: PERLSKY_REMOTE_REPLY_POST_URL,
  },
});

export { PERLSKY_ADAPTER };
