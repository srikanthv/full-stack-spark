import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Users, StopCircle, Play, Copy, Check, Mic, MicOff, Maximize, Radio, UserPlus, UserMinus, XCircle, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

export interface ScreenSharePresenterProps {
  roomId: string;
  peerConfig?: ConstructorParameters<typeof Peer>[1];
}

export type PresenterStatus = 'connecting' | 'ready' | 'sharing' | 'error';

// Data channel message types
interface DataMessage {
  type: 'meeting-ended' | 'viewer-muted' | 'viewer-unmuted';
  viewerId?: string;
}

// Viewer activity event for join/leave notifications
interface ViewerActivity {
  type: 'join' | 'leave';
  viewerId: string;
  timestamp: number;
}

// Track viewer info including mute state
interface ViewerInfo {
  connection: DataConnection;
  isMutedByPresenter: boolean;
}

const ScreenSharePresenter = ({ roomId, peerConfig }: ScreenSharePresenterProps) => {
  const [isSharing, setIsSharing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [status, setStatus] = useState<PresenterStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [recentActivity, setRecentActivity] = useState<ViewerActivity[]>([]);
  const [mutedViewers, setMutedViewers] = useState<Set<string>>(new Set());
  const [isViewerAudioEnabled, setIsViewerAudioEnabled] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  
  // Container ref for viewer audio elements
  const viewerAudioContainerRef = useRef<HTMLDivElement>(null);

  // Track connected viewers by their peer IDs with full info
  const viewerConnections = useRef<Map<string, ViewerInfo>>(new Map());
  // Track active media calls to viewers
  const viewerMediaCalls = useRef<Map<string, MediaConnection>>(new Map());
  // Track incoming viewer audio streams and their audio elements
  const viewerAudioElements = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Add viewer activity notification
  const addViewerActivity = useCallback((type: 'join' | 'leave', viewerId: string) => {
    const activity: ViewerActivity = {
      type,
      viewerId: viewerId.split('-').pop() || viewerId, // Short ID
      timestamp: Date.now(),
    };
    
    setRecentActivity(prev => [...prev.slice(-4), activity]); // Keep last 5

    // Show toast notification
    if (type === 'join') {
      toast.success(`Viewer joined`, { icon: <UserPlus className="w-4 h-4" /> });
    } else {
      toast.info(`Viewer left`, { icon: <UserMinus className="w-4 h-4" /> });
    }

    // Clear activity after 5 seconds
    setTimeout(() => {
      setRecentActivity(prev => prev.filter(a => a.timestamp !== activity.timestamp));
    }, 5000);
  }, []);

  // Send data message to specific viewer
  const sendToViewer = useCallback((viewerId: string, message: DataMessage) => {
    const viewerInfo = viewerConnections.current.get(viewerId);
    if (viewerInfo?.connection.open) {
      viewerInfo.connection.send(message);
    }
  }, []);

  // Send data message to all viewers
  const broadcastToViewers = useCallback((message: DataMessage) => {
    viewerConnections.current.forEach((viewerInfo, viewerId) => {
      if (viewerInfo.connection.open) {
        viewerInfo.connection.send(message);
      }
    });
  }, []);

  // Mute a specific viewer
  const muteViewer = useCallback((viewerId: string) => {
    sendToViewer(viewerId, { type: 'viewer-muted', viewerId });
    const viewerInfo = viewerConnections.current.get(viewerId);
    if (viewerInfo) {
      viewerInfo.isMutedByPresenter = true;
    }
    setMutedViewers(prev => new Set([...prev, viewerId]));
    toast.success('Viewer muted');
  }, [sendToViewer]);

  // Unmute a specific viewer
  const unmuteViewer = useCallback((viewerId: string) => {
    sendToViewer(viewerId, { type: 'viewer-unmuted', viewerId });
    const viewerInfo = viewerConnections.current.get(viewerId);
    if (viewerInfo) {
      viewerInfo.isMutedByPresenter = false;
    }
    setMutedViewers(prev => {
      const next = new Set(prev);
      next.delete(viewerId);
      return next;
    });
    toast.success('Viewer unmuted');
  }, [sendToViewer]);

  // End meeting and clean up
  const endMeeting = useCallback(() => {
    // Notify all viewers
    broadcastToViewers({ type: 'meeting-ended' });

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioTrackRef.current = null;

    // Close all media calls
    viewerMediaCalls.current.forEach((call) => {
      call.close();
    });
    viewerMediaCalls.current.clear();

    // Close all data connections
    viewerConnections.current.forEach((viewerInfo) => {
      viewerInfo.connection.close();
    });
    viewerConnections.current.clear();

    // Clear viewer audio elements
    viewerAudioElements.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    viewerAudioElements.current.clear();

    // Clear video preview
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Reset state
    setIsSharing(false);
    setViewerCount(0);
    setMutedViewers(new Set());
    setIsViewerAudioEnabled(false);
    setIsSpeakerMuted(false);
    setStatus('ready');
    
    toast.success('Meeting ended');
  }, [broadcastToViewers]);

  // Initialize PeerJS connection
  useEffect(() => {
    if (!roomId) return;

    const presenterId = `presenter-${roomId}`;

    const peer = new Peer(presenterId, {
      debug: 2,
      ...peerConfig,
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
      endMeeting();
      peer.destroy();
    };
  }, [roomId, peerConfig, endMeeting]);

  // Handle incoming viewer data connections
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleDataConnection = (conn: DataConnection) => {
      console.log('Viewer data connection from:', conn.peer);

      conn.on('open', () => {
        console.log('Viewer data connection open:', conn.peer);

        // Store the data connection with mute state
        viewerConnections.current.set(conn.peer, {
          connection: conn,
          isMutedByPresenter: false,
        });
        setViewerCount(viewerConnections.current.size);
        addViewerActivity('join', conn.peer);

        // If we're already sharing, immediately call this viewer with the stream
        if (streamRef.current && isSharing) {
          console.log('Sharing already active, calling new viewer:', conn.peer);
          callViewer(conn.peer, streamRef.current);
        }
      });

      conn.on('close', () => {
        console.log('Viewer data connection closed:', conn.peer);
        viewerConnections.current.delete(conn.peer);
        viewerMediaCalls.current.delete(conn.peer);
        // Clean up audio element for this viewer
        const audioEl = viewerAudioElements.current.get(conn.peer);
        if (audioEl) {
          audioEl.srcObject = null;
          audioEl.remove();
          viewerAudioElements.current.delete(conn.peer);
        }
        setMutedViewers(prev => {
          const next = new Set(prev);
          next.delete(conn.peer);
          return next;
        });
        setViewerCount(viewerConnections.current.size);
        addViewerActivity('leave', conn.peer);
      });

      conn.on('error', (err) => {
        console.error('Viewer data connection error:', err);
        viewerConnections.current.delete(conn.peer);
        viewerMediaCalls.current.delete(conn.peer);
        // Clean up audio element for this viewer
        const audioEl = viewerAudioElements.current.get(conn.peer);
        if (audioEl) {
          audioEl.srcObject = null;
          audioEl.remove();
          viewerAudioElements.current.delete(conn.peer);
        }
        setMutedViewers(prev => {
          const next = new Set(prev);
          next.delete(conn.peer);
          return next;
        });
        setViewerCount(viewerConnections.current.size);
      });
    };

    peer.on('connection', handleDataConnection);

    return () => {
      peer.off('connection', handleDataConnection);
    };
  }, [isSharing, addViewerActivity]);

  // Handle incoming calls from viewers (for two-way audio)
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleCall = (call: MediaConnection) => {
      console.log('Receiving call from viewer:', call.peer);
      
      // Answer viewer's call (we receive their audio)
      call.answer();

      call.on('stream', (remoteStream) => {
        console.log('Received audio stream from viewer:', call.peer, 'tracks:', remoteStream.getTracks().map(t => t.kind));
        
        // Create a dedicated audio element for this viewer
        let audioEl = viewerAudioElements.current.get(call.peer);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          // Start muted for autoplay policy, user must click to enable
          audioEl.muted = !isViewerAudioEnabled;
          viewerAudioContainerRef.current?.appendChild(audioEl);
          viewerAudioElements.current.set(call.peer, audioEl);
        }
        
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(err => {
          console.log('Viewer audio autoplay blocked:', err);
        });
        
        setIsViewerAudioEnabled(prev => prev); // Force re-render to show audio controls
        toast.success('Viewer microphone connected');
      });

      call.on('close', () => {
        console.log('Viewer audio call closed:', call.peer);
        const audioEl = viewerAudioElements.current.get(call.peer);
        if (audioEl) {
          audioEl.srcObject = null;
          audioEl.remove();
          viewerAudioElements.current.delete(call.peer);
        }
      });
    };

    peer.on('call', handleCall);

    return () => {
      peer.off('call', handleCall);
    };
  }, [isViewerAudioEnabled]);

  // Enable viewer audio playback (user interaction required)
  const enableViewerAudio = useCallback(() => {
    // Unmute all viewer audio elements
    viewerAudioElements.current.forEach((audio) => {
      audio.muted = false;
      audio.play().catch(err => {
        console.error('Error playing viewer audio:', err);
      });
    });
    setIsViewerAudioEnabled(true);
    setIsSpeakerMuted(false);
    toast.success('Viewer audio enabled');
  }, []);

  // Toggle speaker mute for viewer audio
  const toggleSpeakerMute = useCallback(() => {
    const newMuted = !isSpeakerMuted;
    viewerAudioElements.current.forEach((audio) => {
      audio.muted = newMuted;
    });
    setIsSpeakerMuted(newMuted);
    toast.success(newMuted ? 'Speaker muted' : 'Speaker unmuted');
  }, [isSpeakerMuted]);

  // Call a viewer with the stream
  const callViewer = useCallback((viewerId: string, stream: MediaStream) => {
    const peer = peerRef.current;
    if (!peer) return;

    console.log('Calling viewer with stream:', viewerId);
    const call = peer.call(viewerId, stream);
    viewerMediaCalls.current.set(viewerId, call);

    call.on('close', () => {
      console.log('Media call closed:', viewerId);
      viewerMediaCalls.current.delete(viewerId);
    });

    call.on('error', (err) => {
      console.error('Media call error:', err);
      viewerMediaCalls.current.delete(viewerId);
    });
  }, []);

  const startSharing = useCallback(async () => {
    try {
      // Request screen share (video only)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        } as MediaTrackConstraints,
        audio: false,
      });

      // Extract the video track
      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track available');
      }

      // Request microphone audio
      let audioTrack: MediaStreamTrack | null = null;
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioTrack = audioStream.getAudioTracks()[0];
        audioTrackRef.current = audioTrack;
        // Set initial mic state
        audioTrack.enabled = isMicOn;
        console.log('Microphone captured successfully');
      } catch (audioErr) {
        console.warn('Microphone access denied or unavailable:', audioErr);
        toast.warning('Microphone not available - sharing screen only');
      }

      // Create combined stream with video + audio (if available)
      const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
      const outboundStream = new MediaStream(tracks);
      streamRef.current = outboundStream;

      setIsSharing(true);
      setStatus('sharing');

      // Show preview using the same stream viewers will receive (muted to prevent echo)
      if (videoRef.current) {
        videoRef.current.srcObject = outboundStream;
        videoRef.current.play().catch(err => {
          console.error('Error playing preview:', err);
        });
      }

      // Handle stream end (user clicks "Stop sharing" in browser UI)
      videoTrack.onended = () => {
        stopSharing();
      };

      // Call all currently connected viewers
      console.log('Calling all connected viewers:', viewerConnections.current.size);
      viewerConnections.current.forEach((_, viewerId) => {
        callViewer(viewerId, outboundStream);
      });

      console.log('Screen sharing started with', audioTrack ? 'audio' : 'video only');
    } catch (err) {
      console.error('Error starting screen share:', err);
      setError('Failed to start screen sharing. Please allow screen access.');
    }
  }, [callViewer, isMicOn]);

  const stopSharing = useCallback(() => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioTrackRef.current = null;

    // Close all media calls
    viewerMediaCalls.current.forEach((call) => {
      call.close();
    });
    viewerMediaCalls.current.clear();

    // Clear video preview
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsSharing(false);
    if (status !== 'error') {
      setStatus('ready');
    }
    console.log('Screen sharing stopped');
  }, [status]);

  // Toggle microphone on/off
  const toggleMic = useCallback(() => {
    if (audioTrackRef.current) {
      const newState = !isMicOn;
      audioTrackRef.current.enabled = newState;
      setIsMicOn(newState);
      toast.success(newState ? 'Microphone unmuted' : 'Microphone muted');
    }
  }, [isMicOn]);

  // Toggle fullscreen for presenter preview
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

  const copyViewerLink = useCallback(() => {
    const link = `${window.location.origin}/viewer/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Viewer link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // Get list of connected viewer IDs for display
  const connectedViewerIds = Array.from(viewerConnections.current.keys());
  const hasViewerAudio = viewerAudioElements.current.size > 0;

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Hidden container for viewer audio elements */}
      <div ref={viewerAudioContainerRef} className="hidden" />
      
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
            {/* Live status indicator with pulsing animation */}
            {status === 'sharing' && (
              <Badge variant="default" className="flex items-center gap-1.5 bg-red-500 hover:bg-red-500">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </Badge>
            )}
            <Badge variant={status === 'sharing' ? 'default' : 'secondary'}>
              {status === 'connecting' && 'Connecting...'}
              {status === 'ready' && 'Ready'}
              {status === 'sharing' && 'Sharing'}
              {status === 'error' && 'Error'}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>

        {/* Viewer activity notifications */}
        {recentActivity.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recentActivity.map((activity) => (
              <Badge 
                key={activity.timestamp}
                variant={activity.type === 'join' ? 'default' : 'secondary'}
                className="animate-in fade-in slide-in-from-top-2 duration-300"
              >
                {activity.type === 'join' ? (
                  <UserPlus className="w-3 h-3 mr-1" />
                ) : (
                  <UserMinus className="w-3 h-3 mr-1" />
                )}
                Viewer {activity.viewerId.slice(0, 4)} {activity.type === 'join' ? 'joined' : 'left'}
              </Badge>
            ))}
          </div>
        )}

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
            <div className="flex gap-3 flex-wrap">
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
                <>
                  <Button
                    onClick={stopSharing}
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    <StopCircle className="w-4 h-4" />
                    Stop Sharing
                  </Button>
                  <Button
                    onClick={toggleMic}
                    variant={isMicOn ? 'secondary' : 'outline'}
                    className="flex items-center gap-2"
                  >
                    {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {isMicOn ? 'Mic On' : 'Mic Off'}
                  </Button>
                  <Button
                    onClick={endMeeting}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    End Meeting
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Share this link with viewers:
              </p>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                {window.location.origin}/viewer/{roomId}
              </code>
              <Button variant="ghost" size="sm" onClick={copyViewerLink}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Viewer Management */}
        {viewerCount > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Connected Viewers ({viewerCount})
              </CardTitle>
              {hasViewerAudio && (
                <div className="flex items-center gap-2">
                  {!isViewerAudioEnabled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={enableViewerAudio}
                      className="flex items-center gap-1"
                    >
                      <VolumeX className="w-4 h-4" />
                      Enable Viewer Audio
                    </Button>
                  ) : (
                    <Button
                      variant={isSpeakerMuted ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={toggleSpeakerMute}
                      className="flex items-center gap-1"
                    >
                      {isSpeakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      {isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
                    </Button>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {connectedViewerIds.map((viewerId) => {
                  const shortId = viewerId.split('-').pop() || viewerId;
                  const isMuted = mutedViewers.has(viewerId);
                  const hasAudio = viewerAudioElements.current.has(viewerId);
                  return (
                    <div
                      key={viewerId}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Viewer {shortId.slice(0, 6)}
                        </span>
                        {hasAudio && !isMuted && (
                          <Badge variant="outline" className="text-xs">
                            <Mic className="w-3 h-3 mr-1" />
                            Mic On
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant={isMuted ? 'outline' : 'ghost'}
                        size="sm"
                        onClick={() => isMuted ? unmuteViewer(viewerId) : muteViewer(viewerId)}
                        className="flex items-center gap-1"
                      >
                        {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        {isMuted ? 'Unmute' : 'Mute'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Preview (Same as Viewer)</CardTitle>
            {isSharing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="flex items-center gap-1"
              >
                <Maximize className="w-4 h-4" />
                Fullscreen
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              controls={false}
              className={`w-full rounded-lg bg-black aspect-video ${!isSharing ? 'hidden' : ''}`}
            />
            {!isSharing && (
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

export default ScreenSharePresenter;
