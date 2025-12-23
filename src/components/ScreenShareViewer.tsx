import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Loader2, Maximize, Volume2, VolumeX, Mic, MicOff, LogOut, MousePointerClick, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export interface ScreenShareViewerProps {
  roomId: string;
  peerConfig?: ConstructorParameters<typeof Peer>[1];
}

export type ViewerStatus = 'connecting' | 'waiting' | 'receiving' | 'ended' | 'error' | 'left';

// Data channel message types
interface DataMessage {
  type: 'meeting-ended' | 'viewer-muted' | 'viewer-unmuted';
  viewerId?: string;
}

const ScreenShareViewer = ({ roomId, peerConfig }: ScreenShareViewerProps) => {
  const [status, setStatus] = useState<ViewerStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showAudioOverlay, setShowAudioOverlay] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false); // Local mic mute (viewer controls)
  const [isMutedByPresenter, setIsMutedByPresenter] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCallRef = useRef<MediaConnection | null>(null);

  // Clean up all connections and streams
  const cleanupConnections = useCallback(() => {
    // Stop mic stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // Close mic call
    if (micCallRef.current) {
      micCallRef.current.close();
      micCallRef.current = null;
    }

    // Close media call
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }

    // Close data connection
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }

    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Leave meeting handler
  const leaveMeeting = useCallback(() => {
    console.log('Leaving meeting...');
    cleanupConnections();
    
    // Destroy peer connection
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setStatus('left');
    setIsMicEnabled(false);
    setIsMicMuted(false);
    setIsMutedByPresenter(false);
    toast.success('You have left the meeting');
  }, [cleanupConnections]);

  // Rejoin meeting handler
  const rejoinMeeting = useCallback(() => {
    window.location.reload();
  }, []);

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

      // Handle data messages from presenter
      conn.on('data', (data) => {
        const message = data as DataMessage;
        console.log('Received message from presenter:', message);

        if (message.type === 'meeting-ended') {
          setStatus('ended');
          cleanupConnections();
          toast.info('The presenter has ended the meeting');
        } else if (message.type === 'viewer-muted') {
          setIsMutedByPresenter(true);
          // Immediately disable audio sending
          if (micStreamRef.current) {
            const audioTrack = micStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
              audioTrack.enabled = false;
            }
          }
          toast.warning('You have been muted by the presenter');
        } else if (message.type === 'viewer-unmuted') {
          setIsMutedByPresenter(false);
          // Re-enable audio if mic is on and not locally muted
          if (micStreamRef.current && isMicEnabled && !isMicMuted) {
            const audioTrack = micStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
              audioTrack.enabled = true;
            }
          }
          toast.success('The presenter has unmuted you');
        }
      });

      conn.on('close', () => {
        console.log('Presenter disconnected');
        if (status !== 'left') {
          setStatus('ended');
        }
      });

      conn.on('error', (err) => {
        console.error('Connection error:', err);
      });
    });

    // Handle incoming call (screen share stream)
    peer.on('call', (call) => {
      console.log('Receiving call from presenter');
      callRef.current = call;

      // Answer the call without sending any stream (view-only by default)
      call.answer();

      call.on('stream', (remoteStream) => {
        console.log('Received remote stream, tracks:', remoteStream.getTracks().map(t => t.kind));

        if (videoRef.current) {
          const video = videoRef.current;
          
          // Clear any existing stream first
          video.srcObject = null;
          
          // Ensure video is muted BEFORE attaching stream (browser autoplay policy)
          video.muted = true;
          
          // Attach the stream
          video.srcObject = remoteStream;
          
          // Update status to show video element
          setStatus('receiving');
          
          // Force play with muted state to bypass autoplay restrictions
          requestAnimationFrame(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play()
                .then(() => {
                  console.log('Video playback started successfully');
                })
                .catch(err => {
                  console.error('Error playing video:', err);
                  setTimeout(() => {
                    if (videoRef.current) {
                      videoRef.current.muted = true;
                      videoRef.current.play().catch(e => console.error('Retry play failed:', e));
                    }
                  }, 200);
                });
            }
          });
        }
      });

      call.on('close', () => {
        console.log('Call ended');
        if (status !== 'left') {
          setStatus('ended');
        }
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
      cleanupConnections();
      peer.destroy();
    };
  }, [roomId, peerConfig, cleanupConnections]);

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

  // Enable audio (click to enable - satisfies autoplay policy)
  const enableAudio = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      setShowAudioOverlay(false);
      toast.success('Audio enabled');
    }
  }, []);

  // Toggle speaker mute/unmute locally (does not affect WebRTC tracks)
  const toggleSpeakerMute = useCallback(() => {
    if (videoRef.current) {
      const newMutedState = !isMuted;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      setShowAudioOverlay(false);
      toast.success(newMutedState ? 'Speaker muted' : 'Speaker unmuted');
    }
  }, [isMuted]);

  // Enable viewer microphone (simple toggle, not push-to-talk)
  const enableMicrophone = useCallback(async () => {
    if (!peerRef.current) {
      toast.error('Not connected to room');
      return;
    }

    try {
      // Request microphone access
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      
      // Start with mic enabled (audio is actively sent)
      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMutedByPresenter; // Respect presenter mute
      }
      
      // Call presenter with our audio stream
      const presenterId = `presenter-${roomId}`;
      const call = peerRef.current.call(presenterId, micStream);
      micCallRef.current = call;

      call.on('error', (err) => {
        console.error('Mic call error:', err);
        toast.error('Failed to send audio to presenter');
      });

      setIsMicEnabled(true);
      setIsMicMuted(false);
      toast.success('Microphone enabled');
    } catch (err) {
      console.error('Error accessing microphone:', err);
      toast.error('Could not access microphone');
    }
  }, [roomId, isMutedByPresenter]);

  // Toggle microphone mute (viewer controls whether audio is sent)
  const toggleMicMute = useCallback(() => {
    if (isMutedByPresenter) {
      toast.error('You are muted by the presenter');
      return;
    }
    
    if (micStreamRef.current) {
      const audioTrack = micStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const newMutedState = !isMicMuted;
        audioTrack.enabled = !newMutedState;
        setIsMicMuted(newMutedState);
        toast.success(newMutedState ? 'Microphone muted' : 'Microphone unmuted');
      }
    }
  }, [isMicMuted, isMutedByPresenter]);

  // Disable viewer microphone completely
  const disableMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (micCallRef.current) {
      micCallRef.current.close();
      micCallRef.current = null;
    }
    setIsMicEnabled(false);
    setIsMicMuted(false);
    toast.success('Microphone disabled');
  }, []);

  const getStatusMessage = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting to room...';
      case 'waiting':
        return 'Waiting for presenter to start sharing...';
      case 'receiving':
        return 'Receiving screen share';
      case 'ended':
        return 'Meeting has ended';
      case 'left':
        return 'You left the meeting';
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
      case 'left':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  // Left meeting state
  if (status === 'left') {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <LogOut className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">You've left the meeting</h2>
              <p className="text-muted-foreground mt-2">
                You can rejoin anytime by clicking the button below.
              </p>
            </div>
            <Button onClick={rejoinMeeting} className="w-full">
              Rejoin Meeting
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Meeting ended state
  if (status === 'ended') {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Monitor className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Meeting Ended</h2>
              <p className="text-muted-foreground mt-2">
                The presenter has ended this meeting.
              </p>
            </div>
            <Button onClick={rejoinMeeting} className="w-full">
              Rejoin When Available
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine effective mic state for display
  const isMicEffectivelyMuted = isMutedByPresenter || isMicMuted;

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
          <div className="flex items-center gap-2">
            <Badge variant={getStatusVariant()}>
              {status === 'connecting' || status === 'waiting' ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : null}
              {getStatusMessage()}
            </Badge>
            {status !== 'error' && (
              <Button
                variant="outline"
                size="sm"
                onClick={leaveMeeting}
                className="flex items-center gap-1 text-destructive hover:text-destructive"
              >
                <LogOut className="w-4 h-4" />
                Leave
              </Button>
            )}
          </div>
        </div>

        {/* Muted by presenter warning */}
        {isMutedByPresenter && (
          <Card className="border-amber-500/50 bg-amber-500/10">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                You have been muted by the presenter. Your microphone is disabled.
              </p>
            </CardContent>
          </Card>
        )}

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
                {/* Microphone controls */}
                {!isMicEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={enableMicrophone}
                    className="flex items-center gap-1"
                  >
                    <Mic className="w-4 h-4" />
                    Enable Mic
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant={isMicEffectivelyMuted ? 'outline' : 'default'}
                      size="sm"
                      onClick={toggleMicMute}
                      disabled={isMutedByPresenter}
                      className={`flex items-center gap-1 ${!isMicEffectivelyMuted ? 'bg-green-500 hover:bg-green-600' : ''}`}
                    >
                      {isMicEffectivelyMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      {isMicEffectivelyMuted ? 'Mic Off' : 'Mic On'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={disableMicrophone}
                      className="text-destructive hover:text-destructive"
                      title="Disable microphone"
                    >
                      <MicOff className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <div className="h-4 w-px bg-border" />
                {/* Speaker controls */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSpeakerMute}
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
          <CardContent className="relative">
            {/* Audio enable overlay - appears on first stream */}
            {status === 'receiving' && showAudioOverlay && isMuted && (
              <div 
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-lg cursor-pointer transition-opacity hover:bg-black/50"
                onClick={enableAudio}
              >
                <div className="text-center text-white">
                  <MousePointerClick className="w-12 h-12 mx-auto mb-3 animate-bounce" />
                  <p className="text-lg font-medium">Click to enable audio</p>
                  <p className="text-sm text-white/70 mt-1">Video is playing (muted)</p>
                </div>
              </div>
            )}
            
            {/* Video element always rendered but visibility controlled via positioning */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full rounded-lg bg-black aspect-video ${status !== 'receiving' ? 'absolute opacity-0 pointer-events-none' : ''}`}
            />
            {(status === 'connecting' || status === 'waiting' || status === 'error') && (
              <div className="w-full aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
                {(status === 'connecting' || status === 'waiting') && (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                )}
                <p className="text-muted-foreground text-center">
                  {status === 'connecting' && 'Connecting to room...'}
                  {status === 'waiting' && 'Waiting for presenter to start sharing...'}
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

        {/* Mic info */}
        {status === 'receiving' && isMicEnabled && !isMutedByPresenter && !isMicMuted && (
          <Card className="border-green-500/50 bg-green-500/10">
            <CardContent className="pt-4">
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Your microphone is on. The presenter can hear you.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ScreenShareViewer;
