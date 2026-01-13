# Self-Hosted PeerJS and TURN Server

This directory contains Docker configuration for running your own PeerJS signaling server and Coturn TURN/STUN server.

## Quick Start (Development)

1. **Start the Docker services:**

   ```bash
   cd docker
   docker-compose up -d
   ```

2. **Set up environment variables:**

   Copy the example environment file to your project root:

   ```bash
   # From project root
   cp docker/env.development.example .env.development
   ```

3. **Start your React app:**

   ```bash
   npm run dev
   ```

## Services

| Service | Port | Description |
|---------|------|-------------|
| PeerJS | 9000 | WebRTC signaling server |
| Coturn TURN | 3478 (UDP/TCP) | Media relay server |
| Coturn TURNS | 5349 (UDP/TCP) | Secure media relay (TLS) |
| UDP Relay | 49152-49200 | Media relay port range |

## Production Deployment

### 1. Configure Environment

Copy and edit the production environment file:

```bash
cp docker/env.production.example .env.production
```

Update the following values:
- `VITE_PEERJS_HOST` - Your server's domain or IP
- `VITE_STUN_URL` - Your STUN server URL
- `VITE_TURN_URLS` - Your TURN server URLs
- `VITE_TURN_USERNAME` - Change default credentials
- `VITE_TURN_CREDENTIAL` - Change default credentials

### 2. Configure Coturn for Production

Edit `docker/coturn/turnserver.conf`:

1. **Set your external IP:**
   ```
   external-ip=YOUR_PUBLIC_IP
   ```

2. **Configure SSL certificates:**
   ```
   cert=/etc/coturn/certs/turn_server_cert.pem
   pkey=/etc/coturn/certs/turn_server_pkey.pem
   ```

3. **Update credentials:**
   ```
   user=your-username:your-strong-password
   realm=your-domain.com
   ```

4. **Enable security restrictions:**
   Uncomment the `denied-peer-ip` lines to prevent relay to private networks.

### 3. SSL/TLS Setup

For production, you need SSL certificates. Options:

**Option A: Let's Encrypt (Recommended)**

Mount your certificates into the container:

```yaml
volumes:
  - /etc/letsencrypt/live/your-domain.com/fullchain.pem:/etc/coturn/certs/turn_server_cert.pem:ro
  - /etc/letsencrypt/live/your-domain.com/privkey.pem:/etc/coturn/certs/turn_server_pkey.pem:ro
```

**Option B: Reverse Proxy**

Place PeerJS behind nginx/traefik with SSL termination.

### 4. Firewall Configuration

Ensure these ports are open:

```bash
# PeerJS
ufw allow 9000/tcp

# STUN/TURN
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp

# UDP relay range
ufw allow 49152:49200/udp
```

## Troubleshooting

### Connection Issues

1. **Check services are running:**
   ```bash
   docker-compose ps
   docker-compose logs
   ```

2. **Test TURN server:**
   Use [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) to test your TURN server.

3. **Check firewall:**
   Ensure all required ports are open.

### Common Errors

- **"Peer unavailable"**: PeerJS server not reachable
- **"ICE connection failed"**: TURN server not accessible or credentials wrong
- **"Media relay failed"**: Check UDP relay ports are open

## Architecture

```
┌─────────────┐         ┌──────────────┐
│   Browser   │◄───────►│   PeerJS     │  Signaling (WebSocket)
│  (Presenter)│         │   Server     │
└──────┬──────┘         └──────────────┘
       │
       │ Media Stream (WebRTC)
       │
       ▼
┌─────────────┐
│   Coturn    │  TURN relay (when direct P2P fails)
│   Server    │
└──────┬──────┘
       │
       │ Media Stream (WebRTC)
       │
       ▼
┌─────────────┐
│   Browser   │
│   (Viewer)  │
└─────────────┘
```
