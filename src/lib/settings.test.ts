import {
  DEFAULT_SETTINGS,
  hasCurrentRemoteAiConsent,
  parseSettings,
  REMOTE_AI_CONSENT_VERSION,
} from './settings';

describe('remote AI consent settings', () => {
  const acceptedAt = '2026-07-11T12:00:00.000Z';

  it('defaults remote processing to off for new and legacy settings', () => {
    expect(DEFAULT_SETTINGS.remoteAiConsent).toBeNull();
    expect(parseSettings(null).remoteAiConsent).toBeNull();
    expect(parseSettings(JSON.stringify({ soundOn: false })).remoteAiConsent).toBeNull();
  });

  it('accepts only the current disclosure version with a valid timestamp', () => {
    const parsed = parseSettings(
      JSON.stringify({
        remoteAiConsent: { version: REMOTE_AI_CONSENT_VERSION, acceptedAt },
      }),
    );

    expect(parsed.remoteAiConsent).toEqual({ version: REMOTE_AI_CONSENT_VERSION, acceptedAt });
    expect(hasCurrentRemoteAiConsent(parsed.remoteAiConsent)).toBe(true);
  });

  it.each([
    { version: REMOTE_AI_CONSENT_VERSION + 1, acceptedAt },
    { version: REMOTE_AI_CONSENT_VERSION, acceptedAt: 'not-a-date' },
    true,
  ])('fails closed for stale or malformed stored consent: %p', (remoteAiConsent) => {
    const parsed = parseSettings(JSON.stringify({ remoteAiConsent }));

    expect(parsed.remoteAiConsent).toBeNull();
    expect(hasCurrentRemoteAiConsent(parsed.remoteAiConsent)).toBe(false);
  });
});
