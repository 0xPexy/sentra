/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly API_URL: string;
  readonly RPC_URL: string;
  readonly DEV_TOKEN?: string;
  readonly SENTRA_NFT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
