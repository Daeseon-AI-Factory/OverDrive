import {
  BODY_AVATAR_DIRECTORY,
  BodyAvatarError,
  assertBodyAvatarDimensions,
  assertBodyAvatarGenerationInput,
  bodyAvatarAtlasPath,
  nextBodyAvatarRevision,
  normalizeBodyAvatarResponse,
  type BodyAvatarConsent,
  type BodyAvatarOutfit,
} from './bodyAvatarClient';

const CONSENT: BodyAvatarConsent = {
  adultConfirmed: true,
  ownershipConfirmed: true,
  aiConsent: true,
};

describe('bodyAvatarClient contracts', () => {
  const pngImage =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8rAAAAAASUVORK5CYII=';

  it.each<BodyAvatarOutfit>(['compression', 'sport_top', 'sleeveless'])('accepts the whitelisted outfit %s', (outfit) => {
    expect(() => assertBodyAvatarGenerationInput(outfit, CONSENT)).not.toThrow();
  });

  it('requires every explicit confirmation', () => {
    for (const key of Object.keys(CONSENT) as (keyof BodyAvatarConsent)[]) {
      const missing = { ...CONSENT, [key]: false };
      expect(() => assertBodyAvatarGenerationInput('compression', missing)).toThrow(
        expect.objectContaining({ code: 'validation' }),
      );
    }
  });

  it('rejects non-whitelisted outfit values at runtime', () => {
    expect(() => assertBodyAvatarGenerationInput('underwear', CONSENT)).toThrow(
      expect.objectContaining({ code: 'validation' }),
    );
  });

  it('normalizes a valid image response and rejects non-image or malformed payloads', () => {
    expect(normalizeBodyAvatarResponse({ mimeType: 'image/png', image: pngImage })).toEqual({
      mimeType: 'image/png',
      image: pngImage,
    });
    expect(() => normalizeBodyAvatarResponse({ mimeType: 'text/plain', image: pngImage })).toThrow(BodyAvatarError);
    expect(() => normalizeBodyAvatarResponse({ mimeType: 'image/png', image: 'not base64' })).toThrow(
      BodyAvatarError,
    );
    expect(() => normalizeBodyAvatarResponse({ mimeType: 'image/jpeg', image: pngImage })).toThrow(
      expect.objectContaining({ code: 'server' }),
    );
  });

  it('accepts only a decodable-size 4:5 atlas envelope', () => {
    expect(() => assertBodyAvatarDimensions(896, 1152)).not.toThrow();
    expect(() => assertBodyAvatarDimensions(1024, 1024)).toThrow(expect.objectContaining({ code: 'server' }));
    expect(() => assertBodyAvatarDimensions(200, 250)).toThrow(expect.objectContaining({ code: 'server' }));
    expect(() => assertBodyAvatarDimensions(2400, 3000)).toThrow(expect.objectContaining({ code: 'server' }));
  });

  it('increments revisions and keeps atlas paths inside the private avatar directory', () => {
    expect(nextBodyAvatarRevision(null)).toBe(1);
    expect(nextBodyAvatarRevision(7)).toBe(8);
    expect(bodyAvatarAtlasPath(8, 'image/png')).toBe(`${BODY_AVATAR_DIRECTORY}atlas-r8.png`);
    expect(bodyAvatarAtlasPath(8, 'image/jpeg')).toBe(`${BODY_AVATAR_DIRECTORY}atlas-r8.jpg`);
  });
});
