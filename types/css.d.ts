// Ambient module declarations for CSS imports.
// Expo SDK 56 supports `import './x.css'` / `import './x.module.css'` (web styling + global.css).
// Native runtime ignores these; this just gives TypeScript a type for the side-effect/module import.
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
