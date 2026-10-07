/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Math-solver backend (Pix2Text + SymPy). Defaults to localhost in dev; set to
   *  your Akash deployment URL at build time, e.g.
   *  VITE_MATH_API_URL=https://onepen-math.<provider>.akash.network/predict */
  readonly VITE_MATH_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
