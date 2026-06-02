// Force-include @types/jest ambient globals (describe/it/expect/...) for `tsc --noEmit`.
// Auto-acquisition from node_modules/@types wasn't picking these up under the Expo base config;
// a reference directive is the surgical fix (no `compilerOptions.types` array, so other @types
// like @types/react are unaffected).
/// <reference types="jest" />
