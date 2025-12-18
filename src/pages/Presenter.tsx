import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Peer, { MediaConnection } from 'peerjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Users, StopCircle, Play } from 'lucide-react';

const Presenter = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [isSharing, setIsSharing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'sharing' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize PeerJS connection
  useEffect(() => {
    if (!roomId) return;

    const presenterId = `presenter-${roomId}`;
    
    // Using free PeerJS cloud server for PoC
    const peer = new Peer(presenterId, {
      debug: 2,
    });

    peer.on('open', (id) => {
      console.log('Presenter connected with ID:', id);
      setStatus('ready');
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setError(err.message);
      setStatus('error');
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected, attempting reconnect...');
      peer.reconnect();
    });

    peerRef.current = peer;

    return () => {
      // Cleanup on unmount
      stopSharing();
      peer.destroy();
    };
  }, [roomId]);

  // Handle incoming viewer connections
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleConnection = (conn: any) => {
      console.log('Viewer connected:', conn.peer);
      
      conn.on('open', () => {
        // If we're already sharing, send the stream to the new viewer
        if (streamRef.current && isSharing) {
          const call = peer.call(conn.peer, streamRef.current);
          connectionsRef.current.set(conn.peer, call);
          setViewerCount(connectionsRef.current.size);
        }
      });

      conn.on('close', () => {
        console.log('Viewer disconnected:', conn.peer);
        connectionsRef.current.delete(conn.peer);
        setViewerCount(connectionsRef.current.size);
      });
    };

    peer.on('connection', handleConnection);

    return () => {
      peer.off('connection', handleConnection);
    };
  }, [isSharing]);

  const startSharing = useCallback(async () => {
    try {
      // Request screen share
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      streamRef.current = stream;
      setIsSharing(true);
      setStatus('sharing');

      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Explicitly play to handle autoplay restrictions
        videoRef.current.play().catch(err => {
          console.error('Error playing preview:', err);
        });
      }

      // Handle stream end (user clicks "Stop sharing" in browser UI)
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };

      // Send stream to all connected viewers
      const peer = peerRef.current;
      if (peer) {
        connectionsRef.current.forEach((_, viewerId) => {
          const call = peer.call(viewerId, stream);
          connectionsRef.current.set(viewerId, call);
        });
      }

      console.log('Screen sharing started');
    } catch (err) {
      console.error('Error starting screen share:', err);
      setError('Failed to start screen sharing. Please allow screen access.');
    }
  }, []);

  const stopSharing = useCallback(() => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close all media connections
    connectionsRef.current.forEach((call) => {
      call.close();
    });
    connectionsRef.current.clear();

    // Clear video preview
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsSharing(false);
    setStatus('ready');
    setViewerCount(0);
    console.log('Screen sharing stopped');
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Presenter Mode</h1>
            <p className="text-muted-foreground mt-1">
              Room: <code className="bg-muted px-2 py-1 rounded">{roomId}</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={status === 'sharing' ? 'default' : 'secondary'}>
              {status === 'connecting' && 'Connecting...'}
              {status === 'ready' && 'Ready'}
              {status === 'sharing' && 'Live'}
              {status === 'error' && 'Error'}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-4">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Screen Share Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              {!isSharing ? (
                <Button 
                  onClick={startSharing} 
                  disabled={status !== 'ready'}
                  className="flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start Screen Share
                </Button>
              ) : (
                <Button 
                  onClick={stopSharing} 
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <StopCircle className="w-4 h-4" />
                  Stop Sharing
                </Button>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Share this link with viewers:{' '}
              <code className="bg-muted px-2 py-1 rounded text-xs">
                {window.location.origin}/viewer/{roomId}
              </code>
            </p>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {isSharing ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full rounded-lg bg-black aspect-video"
              />
            ) : (
              <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">No screen being shared</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Presenter;
