import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Loader2, Maximize, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

export interface ScreenShareViewerProps {
  roomId: string;
  peerConfig?: ConstructorParameters<typeof Peer>[1];
}

export type ViewerStatus = 'connecting' | 'waiting' | 'receiving' | 'ended' | 'error';

const ScreenShareViewer = ({ roomId, peerConfig }: ScreenShareViewerProps) => {
  const [status, setStatus] = useState<ViewerStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<any>(null);

  useEffect(() => {
    if (!roomId) return;

    const presenterId = `presenter-${roomId}`;
    // Generate unique viewer ID
    const viewerId = `viewer-${roomId}-${Math.random().toString(36).substr(2, 9)}`;

    const peer = new Peer(viewerId, {
      debug: 2,
      ...peerConfig,
    });

    peer.on('open', (id) => {
      console.log('Viewer connected with ID:', id);
      setStatus('waiting');

      // Connect to presenter's data channel
      const conn = peer.connect(presenterId);
      connectionRef.current = conn;

      conn.on('open', () => {
        console.log('Connected to presenter data channel');
      });

      conn.on('close', () => {
        console.log('Presenter disconnected');
        setStatus('ended');
      });

      conn.on('error', (err) => {
        console.error('Connection error:', err);
      });
    });

    // Handle incoming call (screen share stream)
    peer.on('call', (call) => {
      console.log('Receiving call from presenter');

      // Answer the call without sending any stream (view-only)
      call.answer();

      call.on('stream', (remoteStream) => {
        console.log('Received remote stream, tracks:', remoteStream.getTracks().map(t => t.kind));
        setStatus('receiving');

        if (videoRef.current) {
          // Clear any existing stream first
          videoRef.current.srcObject = null;
          videoRef.current.srcObject = remoteStream;

          // Use setTimeout to ensure DOM updates before play
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.play().catch(err => {
                console.error('Error playing video:', err);
              });
            }
          }, 100);
        }
      });

      call.on('close', () => {
        console.log('Call ended');
        setStatus('ended');
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      });

      call.on('error', (err) => {
        console.error('Call error:', err);
        setError('Stream connection failed');
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);

      // Handle specific error types
      if (err.type === 'peer-unavailable') {
        setStatus('waiting');
        setError('Presenter not available yet. Waiting...');
      } else {
        setError(err.message);
        setStatus('error');
      }
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected, attempting reconnect...');
      peer.reconnect();
    });

    peerRef.current = peer;

    return () => {
      // Cleanup on unmount
      if (connectionRef.current) {
        connectionRef.current.close();
      }
      peer.destroy();
    };
  }, [roomId, peerConfig]);

  // Toggle fullscreen for viewer video
  const toggleFullscreen = useCallback(() => {
    if (!videoRef.current) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen().catch(err => {
        console.error('Error entering fullscreen:', err);
        toast.error('Could not enter fullscreen mode');
      });
    }
  }, []);

  // Toggle mute/unmute locally (does not affect WebRTC tracks)
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMutedState = !isMuted;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      toast.success(newMutedState ? 'Audio muted' : 'Audio unmuted');
    }
  }, [isMuted]);

  const getStatusMessage = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting to room...';
      case 'waiting':
        return 'Waiting for presenter to start sharing...';
      case 'receiving':
        return 'Receiving screen share';
      case 'ended':
        return 'Presenter stopped sharing';
      case 'error':
        return 'Connection error';
      default:
        return '';
    }
  };

  const getStatusVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'receiving':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Viewer Mode</h1>
            <p className="text-muted-foreground mt-1">
              Room: <code className="bg-muted px-2 py-1 rounded">{roomId}</code>
            </p>
          </div>
          <Badge variant={getStatusVariant()}>
            {status === 'connecting' || status === 'waiting' ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : null}
            {getStatusMessage()}
          </Badge>
        </div>

        {/* Error display */}
        {error && status === 'error' && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-4">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Video display */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Shared Screen
            </CardTitle>
            {status === 'receiving' && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  className="flex items-center gap-1"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="flex items-center gap-1"
                >
                  <Maximize className="w-4 h-4" />
                  Fullscreen
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {/* Always render video element so ref is available when stream arrives */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted}
              className={`w-full rounded-lg bg-black aspect-video ${status !== 'receiving' ? 'hidden' : ''}`}
            />
            {status !== 'receiving' && (
              <div className="w-full aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
                {(status === 'connecting' || status === 'waiting') && (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                )}
                <p className="text-muted-foreground text-center">
                  {status === 'connecting' && 'Connecting to room...'}
                  {status === 'waiting' && 'Waiting for presenter to start sharing...'}
                  {status === 'ended' && 'The presenter has stopped sharing their screen.'}
                  {status === 'error' && 'Unable to connect. Please refresh and try again.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        {status === 'waiting' && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                The presenter will share their screen with you automatically once they start.
                Please keep this tab open.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ScreenShareViewer;
