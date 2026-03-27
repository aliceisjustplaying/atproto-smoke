import { createRoleBasedAdapter } from "./adapter-builder.js";

export const TRANQUIL_PDS_PRIMARY_CLEANUP_PREFIXES = Object.freeze([
  "tranquil browser smoke ",
]);

export const TRANQUIL_PDS_SECONDARY_CLEANUP_PREFIXES = Object.freeze([
  "tranquil browser secondary ",
]);

const tranquilRoleDefaults = (role) => {
  if (role === "secondary") {
    return {
      postText: "tranquil browser secondary post",
      quoteText: "tranquil browser secondary quote",
      replyText: "tranquil browser secondary reply",
      profileNote: "tranquil browser secondary profile edit",
    };
  }

  return {
    postText: "tranquil browser smoke post",
    quoteText: "tranquil browser smoke quote",
    replyText: "tranquil browser smoke reply",
    profileNote: "tranquil browser smoke profile edit",
  };
};

const { adapter: TRANQUIL_PDS_ADAPTER } = createRoleBasedAdapter({
  name: "tranquil-pds",
  description:
    "Use tranquil-pds-flavored defaults like cleanup prefixes and hosted example handles.",
  accountStrategy: "self-register-or-existing-accounts",
  notes: [
    "The standalone suite still expects credentials in the config.",
    "tranquil-pds can self-register accounts via com.atproto.server.createAccount, but that bootstrap stays outside the generic smoke runner.",
  ],
  exampleBase: {
    pdsUrl: "https://tranquil.mosphere.at",
    targetHandle: "alice.tranquil.mosphere.at",
    strictErrors: true,
    primaryHandle: "smoke-primary.tranquil.mosphere.at",
    secondaryHandle: "smoke-secondary.tranquil.mosphere.at",
  },
  roleDefaults: tranquilRoleDefaults,
  primaryCleanupPrefixes: TRANQUIL_PDS_PRIMARY_CLEANUP_PREFIXES,
  secondaryCleanupPrefixes: TRANQUIL_PDS_SECONDARY_CLEANUP_PREFIXES,
});

export { TRANQUIL_PDS_ADAPTER };
