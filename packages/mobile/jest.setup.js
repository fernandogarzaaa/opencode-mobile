// Jest setup: React 19 requires this flag for act() to run without
// spamming console.error warnings (each warning carries a huge stack
// trace; under Stryker the combined output overflows the test runner's
// 1MB buffer and the dry run fails).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
