import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Monitor, 
  Users, 
  StopCircle, 
  Play, 
  Copy, 
  Check, 
  Mic, 
  MicOff, 
  Radio, 
  XCircle, 
  Volume2, 
  VolumeX,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

export interface PresenterControlsProps {
  roomId: string;
  peerConfig?: ConstructorParameters<typeof Peer>[1];
}

type PresenterStatus = 'connecting' | 'ready' | 'sharing' | 'error' | 'ended';

interface DataMessage {
  type: 'meeting-ended' | 'viewer-muted' | 'viewer-unmuted';
  viewerId?: string;
}

interface ViewerInfo {
  connection: DataConnection;
  isMutedByPresenter: boolean;
}

const PresenterControls = ({ roomId, peerConfig }: PresenterControlsProps) => {
  const navigate = useNavigate();
  const [isSharing, setIsSharing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [status, setStatus] = useState<PresenterStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [mutedViewers, setMutedViewers] = useState<Set<string>>(new Set());
  const [isViewerAudioEnabled, setIsViewerAudioEnabled] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const viewerAudioRef = useRef<HTMLAudioElement>(null);

  const viewerConnections = useRef<Map<string, ViewerInfo>>(new Map());
  const viewerMediaCalls = useRef<Map<string, MediaConnection>>(new Map());
  const viewerAudioStreams = useRef<Map<string, MediaStream>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);

  const sendToViewer = useCallback((viewerId: string, message: DataMessage) => {
    const viewerInfo = viewerConnections.current.get(viewerId);
    if (viewerInfo?.connection.open) {
      viewerInfo.connection.send(message);
    }
  }, []);

  const broadcastToViewers = useCallback((message: DataMessage) => {
    viewerConnections.current.forEach((viewerInfo) => {
      if (viewerInfo.connection.open) {
        viewerInfo.connection.send(message);
      }
    });
  }, []);

  const muteViewer = useCallback((viewerId: string) => {
    sendToViewer(viewerId, { type: 'viewer-muted', viewerId });
    const viewerInfo = viewerConnections.current.get(viewerId);
    if (viewerInfo) {
      viewerInfo.isMutedByPresenter = true;
    }
    setMutedViewers(prev => new Set([...prev, viewerId]));
    toast.success('Viewer muted');
  }, [sendToViewer]);

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

  const endMeeting = useCallback(() => {
    broadcastToViewers({ type: 'meeting-ended' });

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioTrackRef.current = null;

    viewerMediaCalls.current.forEach((call) => call.close());
    viewerMediaCalls.current.clear();

    viewerConnections.current.forEach((viewerInfo) => viewerInfo.connection.close());
    viewerConnections.current.clear();

    viewerAudioStreams.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsSharing(false);
    setViewerCount(0);
    setMutedViewers(new Set());
    setIsViewerAudioEnabled(false);
    setStatus('ended');
    
    toast.success('Meeting ended');
  }, [broadcastToViewers]);

  // Initialize PeerJS connection
  useEffect(() => {
    if (!roomId) return;

    const presenterId = `presenter-${roomId}`;
    const peer = new Peer(presenterId, { debug: 2, ...peerConfig });

    peer.on('open', () => {
      console.log('Presenter connected');
      setStatus('ready');
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setError(err.message);
      setStatus('error');
    });

    peer.on('disconnected', () => {
      peer.reconnect();
    });

    peerRef.current = peer;

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      peer.destroy();
    };
  }, [roomId, peerConfig]);

  // Handle viewer data connections
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleDataConnection = (conn: DataConnection) => {
      conn.on('open', () => {
        viewerConnections.current.set(conn.peer, {
          connection: conn,
          isMutedByPresenter: false,
        });
        setViewerCount(viewerConnections.current.size);
        toast.success('Viewer joined');

        if (streamRef.current && isSharing) {
          callViewer(conn.peer, streamRef.current);
        }
      });

      conn.on('close', () => {
        viewerConnections.current.delete(conn.peer);
        viewerMediaCalls.current.delete(conn.peer);
        viewerAudioStreams.current.delete(conn.peer);
        setMutedViewers(prev => {
          const next = new Set(prev);
          next.delete(conn.peer);
          return next;
        });
        setViewerCount(viewerConnections.current.size);
        toast.info('Viewer left');
      });

      conn.on('error', () => {
        viewerConnections.current.delete(conn.peer);
        viewerMediaCalls.current.delete(conn.peer);
        viewerAudioStreams.current.delete(conn.peer);
        setViewerCount(viewerConnections.current.size);
      });
    };

    peer.on('connection', handleDataConnection);
    return () => {
      peer.off('connection', handleDataConnection);
    };
  }, [isSharing]);

  // Handle incoming viewer audio calls
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleCall = (call: MediaConnection) => {
      call.answer();
      call.on('stream', (remoteStream) => {
        viewerAudioStreams.current.set(call.peer, remoteStream);
        updateViewerAudioMix();
        toast.success('Viewer microphone connected');
      });
      call.on('close', () => {
        viewerAudioStreams.current.delete(call.peer);
        updateViewerAudioMix();
      });
    };

    peer.on('call', handleCall);
    return () => {
      peer.off('call', handleCall);
    };
  }, []);

  const updateViewerAudioMix = useCallback(() => {
    if (!viewerAudioRef.current) return;
    
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    
    const audioContext = audioContextRef.current;
    const destination = audioContext.createMediaStreamDestination();
    
    viewerAudioStreams.current.forEach((stream) => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
    });
    
    viewerAudioRef.current.srcObject = destination.stream;
    viewerAudioRef.current.play().catch(() => {});
  }, []);

  const enableViewerAudio = useCallback(() => {
    if (viewerAudioRef.current) {
      viewerAudioRef.current.muted = false;
      setIsViewerAudioEnabled(true);
      viewerAudioRef.current.play().catch(() => {});
      toast.success('Viewer audio enabled');
    }
  }, []);

  const callViewer = useCallback((viewerId: string, stream: MediaStream) => {
    const peer = peerRef.current;
    if (!peer) return;

    const call = peer.call(viewerId, stream);
    viewerMediaCalls.current.set(viewerId, call);

    call.on('close', () => viewerMediaCalls.current.delete(viewerId));
    call.on('error', () => viewerMediaCalls.current.delete(viewerId));
  }, []);

  const startSharing = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false,
      });

      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('No video track');

      let audioTrack: MediaStreamTrack | null = null;
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioTrack = audioStream.getAudioTracks()[0];
        audioTrackRef.current = audioTrack;
        audioTrack.enabled = isMicOn;
      } catch {
        toast.warning('Microphone not available');
      }

      const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
      const outboundStream = new MediaStream(tracks);
      streamRef.current = outboundStream;

      setIsSharing(true);
      setStatus('sharing');

      videoTrack.onended = () => stopSharing();

      viewerConnections.current.forEach((_, viewerId) => {
        callViewer(viewerId, outboundStream);
      });

      toast.success('Screen sharing started');
    } catch (err) {
      console.error('Error starting screen share:', err);
      setError('Failed to start screen sharing');
    }
  }, [callViewer, isMicOn]);

  const stopSharing = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioTrackRef.current = null;

    viewerMediaCalls.current.forEach((call) => call.close());
    viewerMediaCalls.current.clear();

    setIsSharing(false);
    if (status !== 'error') {
      setStatus('ready');
    }
  }, [status]);

  const toggleMic = useCallback(() => {
    if (audioTrackRef.current) {
      const newState = !isMicOn;
      audioTrackRef.current.enabled = newState;
      setIsMicOn(newState);
      toast.success(newState ? 'Mic on' : 'Mic off');
    }
  }, [isMicOn]);

  const copyViewerLink = useCallback(() => {
    const link = `${window.location.origin}/viewer/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link copied');
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  const restartMeeting = useCallback(() => {
    setStatus('ready');
    setError(null);
  }, []);

  const goToHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const connectedViewerIds = Array.from(viewerConnections.current.keys());

  // Meeting ended state
  if (status === 'ended') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Meeting Ended</CardTitle>
            <CardDescription>
              All viewers have been disconnected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={restartMeeting} className="w-full">
              <Play className="w-4 h-4 mr-2" />
              Start New Session (Same Room)
            </Button>
            <Button variant="outline" onClick={goToHome} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <audio ref={viewerAudioRef} autoPlay muted className="hidden" />
      
      <div className="max-w-lg mx-auto space-y-4">
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            <span className="font-semibold">Presenter Controls</span>
          </div>
          <div className="flex items-center gap-2">
            {status === 'sharing' && (
              <Badge className="bg-red-500 hover:bg-red-500 flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </Badge>
            )}
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {viewerCount}
            </Badge>
          </div>
        </div>

        {/* Guidance Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Demo Tip</p>
                <p className="text-muted-foreground">
                  When the browser picker appears, select the <strong>tab</strong> where your app is open for the best demo experience.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-4">
              <p className="text-destructive text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Main Controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Screen Share</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {!isSharing ? (
                <Button onClick={startSharing} disabled={status !== 'ready'} className="flex-1">
                  <Play className="w-4 h-4 mr-2" />
                  Start Screen Share
                </Button>
              ) : (
                <>
                  <Button onClick={stopSharing} variant="secondary" className="flex-1">
                    <StopCircle className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                  <Button onClick={toggleMic} variant={isMicOn ? 'secondary' : 'outline'} size="icon">
                    {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </Button>
                </>
              )}
            </div>

            {isSharing && (
              <Button onClick={endMeeting} variant="destructive" className="w-full">
                <XCircle className="w-4 h-4 mr-2" />
                End Meeting
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Viewer Link */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-2 py-1.5 rounded text-xs truncate">
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
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Viewers ({viewerCount})</CardTitle>
              {viewerAudioStreams.current.size > 0 && (
                <Button
                  variant={isViewerAudioEnabled ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={enableViewerAudio}
                >
                  {isViewerAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {connectedViewerIds.map((viewerId) => {
                  const shortId = viewerId.split('-').pop()?.slice(0, 6) || viewerId;
                  const isMuted = mutedViewers.has(viewerId);
                  return (
                    <div
                      key={viewerId}
                      className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                    >
                      <span>Viewer {shortId}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => isMuted ? unmuteViewer(viewerId) : muteViewer(viewerId)}
                      >
                        {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status */}
        <p className="text-xs text-center text-muted-foreground">
          Room: {roomId} • {status === 'connecting' ? 'Connecting...' : status === 'ready' ? 'Ready' : status === 'sharing' ? 'Live' : 'Error'}
        </p>
      </div>
    </div>
  );
};

export default PresenterControls;
