// src/webrtc/peerConfig.ts

export const peerConfig = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: [
          "turn:relay1.expressturn.com:3480?transport=udp",
          "turn:relay1.expressturn.com:3480?transport=tcp",
          "turns:relay1.expressturn.com:443?transport=tcp",
        ],
        username: "000000002081507669",
        credential: "mkAGOHY8zB1KkBTF8rKzFgPgEkM=",
      },
    ],
  },
};
