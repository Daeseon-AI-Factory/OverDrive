/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Colocated *.test.ts(x) next to source. Pure-logic tests (combat power, JUICE tier
  // classification, PR detection) are the core unit-test targets per spec §10.
  // RTL v13 auto-extends expect with its matchers — no extend-expect setup needed.
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
