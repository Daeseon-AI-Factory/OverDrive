// Metro bundles .wav as an asset module; the default import resolves to a numeric asset id,
// which expo-audio's createAudioPlayer accepts as an AudioSource.
declare module '*.wav' {
  const asset: number;
  export default asset;
}
