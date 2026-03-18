const createTarget = (target) => Object.freeze(target);

export const PDSLAB_TARGETS = Object.freeze([
  createTarget({
    id: 'perlsky',
    mode: 'dual',
    adapter: 'perlsky',
    ledgerTarget: 'perlsky',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'tranquil',
    mode: 'dual',
    adapter: 'tranquil-pds',
    ledgerTarget: 'tranquil',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'cocoon',
    mode: 'dual',
    adapter: 'bring-your-own',
    ledgerTarget: 'cocoon',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'bluesky-pds',
    mode: 'dual',
    adapter: 'bring-your-own',
    ledgerTarget: 'bluesky-pds',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'millipds',
    mode: 'dual',
    adapter: 'bring-your-own',
    ledgerTarget: 'millipds',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'pegasus',
    mode: 'dual',
    adapter: 'bring-your-own',
    ledgerTarget: 'pegasus',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'rsky',
    mode: 'dual',
    adapter: 'bring-your-own',
    ledgerTarget: 'rsky',
    runnerStatus: 'ready',
    accountSource: 'pdslab-dual-smoke-pair',
    notes: [
      'Canonical same-PDS dual-account smoke target.',
    ],
  }),
  createTarget({
    id: 'pdsjs',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'pdsjs',
    ledgerAccount: 'smoke-a',
    pairGroup: 'pdsjs',
    runnerStatus: 'ready',
    accountSource: 'pdslab-paired-single-a',
    notes: [
      'Base endpoint for the pdsjs single-user pair.',
      'setup.js still ends with a /register-handle 404, but login works.',
    ],
  }),
  createTarget({
    id: 'pdsjs2',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'pdsjs2',
    ledgerAccount: 'smoke-b',
    pairGroup: 'pdsjs',
    runnerStatus: 'ready',
    accountSource: 'pdslab-paired-single-b',
    notes: [
      'Companion endpoint for the pdsjs single-user pair.',
      'setup.js still ends with a /register-handle 404, but login works.',
    ],
  }),
  createTarget({
    id: 'micropod',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'micropod',
    ledgerAccount: 'smoke-a',
    pairGroup: 'micropod',
    runnerStatus: 'ready',
    accountSource: 'pdslab-paired-single-a',
    notes: [
      'Base endpoint for the Micropod single-user pair.',
    ],
  }),
  createTarget({
    id: 'micropod2',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'micropod2',
    ledgerAccount: 'smoke-b',
    pairGroup: 'micropod',
    runnerStatus: 'ready',
    accountSource: 'pdslab-paired-single-b',
    notes: [
      'Companion endpoint for the Micropod single-user pair.',
    ],
  }),
  createTarget({
    id: 'rustproto',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'rustproto',
    ledgerAccount: 'smoke-a',
    pairGroup: 'rustproto',
    runnerStatus: 'ready',
    accountSource: 'pdslab-paired-single-a',
    notes: [
      'Base endpoint for the Rustproto single-user pair.',
      'Initial repo/profile state has already been installed.',
    ],
  }),
  createTarget({
    id: 'rustproto2',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'rustproto2',
    ledgerAccount: 'smoke-b',
    pairGroup: 'rustproto',
    runnerStatus: 'ready',
    accountSource: 'pdslab-paired-single-b',
    notes: [
      'Companion endpoint for the Rustproto single-user pair.',
      'Initial repo/profile state has already been installed.',
    ],
  }),
  createTarget({
    id: 'dnproto',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'dnproto',
    ledgerAccount: 'smoke-a',
    pairGroup: 'dnproto',
    runnerStatus: 'needs-login-identifier-support',
    loginIdentifierKey: 'did',
    accountSource: 'pdslab-paired-single-a',
    notes: [
      'Base endpoint for the Dnproto single-user pair.',
      'Handle-based createSession returns null JWTs on this build; use the DID as the login identifier.',
    ],
  }),
  createTarget({
    id: 'dnproto2',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'dnproto2',
    ledgerAccount: 'smoke-b',
    pairGroup: 'dnproto',
    runnerStatus: 'needs-login-identifier-support',
    loginIdentifierKey: 'did',
    accountSource: 'pdslab-paired-single-b',
    notes: [
      'Companion endpoint for the Dnproto single-user pair.',
      'Handle-based createSession returns null JWTs on this build; use the DID as the login identifier.',
    ],
  }),
  createTarget({
    id: 'cirrus-a',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'cirrus-a',
    currentDeploymentKey: 'currentDeployment',
    runnerStatus: 'ready',
    accountSource: 'pdslab-single-cirrus-side-a',
    notes: [
      'Single-user Cirrus deployment.',
      'This is the A-side endpoint; a future dual-PDS flow can pair it with cirrus-b.',
    ],
  }),
  createTarget({
    id: 'cirrus-b',
    mode: 'single',
    adapter: 'bring-your-own',
    ledgerTarget: 'cirrus-b',
    currentDeploymentKey: 'currentDeployment',
    runnerStatus: 'ready',
    accountSource: 'pdslab-single-cirrus-side-b',
    notes: [
      'Single-user Cirrus deployment.',
      'This is the B-side endpoint; a future dual-PDS flow can pair it with cirrus-a.',
    ],
  }),
  createTarget({
    id: 'cirrus-pair',
    mode: 'dual',
    adapter: 'bring-your-own',
    runnerStatus: 'requires-two-pds-dual-flow',
    notes: [
      'Virtual target for cross-PDS Cirrus testing.',
      'Current run-dual assumes one PDS URL, so this pair needs harness work before it can run.',
    ],
  }),
  createTarget({
    id: 'vow',
    mode: 'dual',
    adapter: 'bring-your-own',
    ledgerTarget: 'vow',
    runnerStatus: 'blocked',
    notes: [
      'Blocked in the deployed build.',
      'Account creation currently fails in the IPFS-backed block write path.',
    ],
  }),
]);

export const getPdslabTarget = (id) => {
  return PDSLAB_TARGETS.find((target) => target.id === id);
};

export const listPdslabTargets = () => {
  return PDSLAB_TARGETS.map((target) => structuredClone(target));
};
