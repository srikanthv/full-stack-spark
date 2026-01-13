// src/webrtc/peerConfig.ts
// Configuration for PeerJS and TURN/STUN servers
// Reads from environment variables for dev/prod flexibility

// Parse TURN URLs from comma-separated string
const parseTurnUrls = (urlString: string | undefined): string[] => {
  if (!urlString) return ['turn:localhost:3478'];
  return urlString.split(',').map(url => url.trim());
};

// PeerJS server configuration
export const peerServerConfig = {
  host: import.meta.env.VITE_PEERJS_HOST || 'localhost',
  port: Number(import.meta.env.VITE_PEERJS_PORT) || 9000,
  path: import.meta.env.VITE_PEERJS_PATH || '/peerjs',
  secure: import.meta.env.VITE_PEERJS_SECURE === 'true',
};

// ICE servers configuration for WebRTC
export const peerConfig = {
  ...peerServerConfig,
  config: {
    iceServers: [
      // STUN server
      { 
        urls: import.meta.env.VITE_STUN_URL || 'stun:localhost:3478' 
      },
      // TURN server(s)
      {
        urls: parseTurnUrls(import.meta.env.VITE_TURN_URLS),
        username: import.meta.env.VITE_TURN_USERNAME || 'webrtc',
        credential: import.meta.env.VITE_TURN_CREDENTIAL || 'webrtc123',
      },
    ],
  },
};
