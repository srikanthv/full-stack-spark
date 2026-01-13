/// <reference types="vite/client" />

interface ImportMetaEnv {
  // PeerJS Server Configuration
  readonly VITE_PEERJS_HOST: string;
  readonly VITE_PEERJS_PORT: string;
  readonly VITE_PEERJS_PATH: string;
  readonly VITE_PEERJS_SECURE: string;

  // STUN/TURN Server Configuration
  readonly VITE_STUN_URL: string;
  readonly VITE_TURN_URLS: string;
  readonly VITE_TURN_USERNAME: string;
  readonly VITE_TURN_CREDENTIAL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}