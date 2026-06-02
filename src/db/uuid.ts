import * as Crypto from 'expo-crypto';

/** RFC4122 v4 UUID. Used for row ids AND client_uuid sync keys (set once, never regenerated). */
export const newUuid = (): string => Crypto.randomUUID();
