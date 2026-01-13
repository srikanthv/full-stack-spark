import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { toast } from 'sonner';
import { peerConfig } from '@/webrtc/peerConfig';

// Data channel message types
interface DataMessage {
  type: 'meeting-ended' | 'viewer-muted' | 'viewer-unmuted';
  viewerId?: string;
}

// Viewer activity event for join/leave notifications
export interface ViewerActivity {
  type: 'join' | 'leave';
  viewerId: string;
  timestamp: number;
}

// Track viewer info including mute state
interface ViewerInfo {
  connection: DataConnection;
  isMutedByPresenter: boolean;
}

export type PresenterStatus = 'idle' | 'connecting' | 'ready' | 'sharing' | 'error';

interface ScreenShareContextValue {
  // State
  roomId: string | null;
  status: PresenterStatus;
  isSharing: boolean;
  viewerCount: number;
  error: string | null;
  isMicOn: boolean;
  recentActivity: ViewerActivity[];
  mutedViewers: Set<string>;
  hasViewerAudio: boolean;
  isViewerAudioEnabled: boolean;
  isSpeakerMuted: boolean;
  connectedViewerIds: string[];
  
  // Refs for UI elements
  videoRef: React.RefObject<HTMLVideoElement>;
  viewerAudioContainerRef: React.RefObject<HTMLDivElement>;
  
  // Actions
  initializeRoom: (roomId: string) => void;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  endMeeting: () => void;
  toggleMic: () => void;
  muteViewer: (viewerId: string) => void;
  unmuteViewer: (viewerId: string) => void;
  enableViewerAudio: () => void;
  toggleSpeakerMute: () => void;
  copyViewerLink: () => void;
  toggleFullscreen: () => void;
  hasViewerAudioElement: (viewerId: string) => boolean;
}

const ScreenShareContext = createContext<ScreenShareContextValue | null>(null);

export const useScreenShare = () => {
  const context = useContext(ScreenShareContext);
  if (!context) {
    throw new Error('useScreenShare must be used within a ScreenShareProvider');
  }
  return context;
};

interface ScreenShareProviderProps {
  children: React.ReactNode;
}

export const ScreenShareProvider: React.FC<ScreenShareProviderProps> = ({ children }) => {
  // State
  const [roomId, setRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<PresenterStatus>('idle');
  const [isSharing, setIsSharing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [recentActivity, setRecentActivity] = useState<ViewerActivity[]>([]);
  const [mutedViewers, setMutedViewers] = useState<Set<string>>(new Set());
  const [hasViewerAudio, setHasViewerAudio] = useState(false);
  const [isViewerAudioEnabled, setIsViewerAudioEnabled] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [connectedViewerIds, setConnectedViewerIds] = useState<string[]>([]);

  // Refs
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const viewerAudioContainerRef = useRef<HTMLDivElement>(null);
  const viewerConnections = useRef<Map<string, ViewerInfo>>(new Map());
  const viewerMediaCalls = useRef<Map<string, MediaConnection>>(new Map());
  const viewerAudioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentRoomIdRef = useRef<string | null>(null);

  // Helper to update connected viewer IDs state
  const updateConnectedViewerIds = useCallback(() => {
    setConnectedViewerIds(Array.from(viewerConnections.current.keys()));
  }, []);

  // Add viewer activity notification
  const addViewerActivity = useCallback((type: 'join' | 'leave', viewerId: string) => {
    const activity: ViewerActivity = {
      type,
      viewerId: viewerId.split('-').pop() || viewerId,
      timestamp: Date.now(),
    };
    
    setRecentActivity(prev => [...prev.slice(-4), activity]);

    if (type === 'join') {
      toast.success(`Viewer joined`);
    } else {
      toast.info(`Viewer left`);
    }

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
    viewerConnections.current.forEach((viewerInfo) => {
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

  // Clean up viewer audio element
  const cleanupViewerAudio = useCallback((viewerId: string) => {
    const audioEl = viewerAudioElements.current.get(viewerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      viewerAudioElements.current.delete(viewerId);
      if (viewerAudioElements.current.size === 0) {
        setHasViewerAudio(false);
      }
    }
  }, []);

  // Reset all state (used when ending meeting)
  const resetAllState = useCallback(() => {
    setIsSharing(false);
    setViewerCount(0);
    setMutedViewers(new Set());
    setIsViewerAudioEnabled(false);
    setIsSpeakerMuted(false);
    setHasViewerAudio(false);
    setConnectedViewerIds([]);
  }, []);

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

    resetAllState();
    setStatus('ready');
    
    toast.success('Meeting ended');
  }, [broadcastToViewers, resetAllState]);

  // Stop sharing without ending the session
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

  // Start screen sharing
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
  }, [callViewer, isMicOn, stopSharing]);

  // Toggle microphone on/off
  const toggleMic = useCallback(() => {
    if (audioTrackRef.current) {
      const newState = !isMicOn;
      audioTrackRef.current.enabled = newState;
      setIsMicOn(newState);
      toast.success(newState ? 'Microphone unmuted' : 'Microphone muted');
    }
  }, [isMicOn]);

  // Enable viewer audio playback (user interaction required)
  const enableViewerAudio = useCallback(() => {
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

  // Copy viewer link
  const copyViewerLink = useCallback(() => {
    if (!roomId) return;
    const link = `${window.location.origin}/viewer/${roomId}`;
    navigator.clipboard.writeText(link);
    toast.success('Viewer link copied to clipboard');
  }, [roomId]);

  // Check if viewer has audio element
  const hasViewerAudioElement = useCallback((viewerId: string) => {
    return viewerAudioElements.current.has(viewerId);
  }, []);

  // Initialize room and PeerJS connection
  const initializeRoom = useCallback((newRoomId: string) => {
    // If already initialized with same room, do nothing
    if (currentRoomIdRef.current === newRoomId && peerRef.current) {
      console.log('Room already initialized:', newRoomId);
      return;
    }

    // Clean up existing peer if different room
    if (peerRef.current && currentRoomIdRef.current !== newRoomId) {
      endMeeting();
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setRoomId(newRoomId);
    currentRoomIdRef.current = newRoomId;
    setStatus('connecting');
    setError(null);

    const presenterId = `presenter-${newRoomId}`;
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
  }, [endMeeting]);

  // Handle incoming viewer data connections
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleDataConnection = (conn: DataConnection) => {
      console.log('Viewer data connection from:', conn.peer);

      conn.on('open', () => {
        console.log('Viewer data connection open:', conn.peer);

        viewerConnections.current.set(conn.peer, {
          connection: conn,
          isMutedByPresenter: false,
        });
        setViewerCount(viewerConnections.current.size);
        updateConnectedViewerIds();
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
        cleanupViewerAudio(conn.peer);
        setMutedViewers(prev => {
          const next = new Set(prev);
          next.delete(conn.peer);
          return next;
        });
        setViewerCount(viewerConnections.current.size);
        updateConnectedViewerIds();
        addViewerActivity('leave', conn.peer);
      });

      conn.on('error', (err) => {
        console.error('Viewer data connection error:', err);
        viewerConnections.current.delete(conn.peer);
        viewerMediaCalls.current.delete(conn.peer);
        cleanupViewerAudio(conn.peer);
        setMutedViewers(prev => {
          const next = new Set(prev);
          next.delete(conn.peer);
          return next;
        });
        setViewerCount(viewerConnections.current.size);
        updateConnectedViewerIds();
      });
    };

    peer.on('connection', handleDataConnection);

    return () => {
      peer.off('connection', handleDataConnection);
    };
  }, [isSharing, addViewerActivity, callViewer, cleanupViewerAudio, updateConnectedViewerIds]);

  // Handle incoming calls from viewers (for two-way audio)
  useEffect(() => {
    const peer = peerRef.current;
    if (!peer) return;

    const handleCall = (call: MediaConnection) => {
      console.log('Receiving call from viewer:', call.peer);
      
      call.answer();

      call.on('stream', (remoteStream) => {
        console.log('Received audio stream from viewer:', call.peer, 'tracks:', remoteStream.getTracks().map(t => t.kind));
        
        const audioTracks = remoteStream.getAudioTracks();
        if (audioTracks.length === 0) {
          console.log('No audio tracks in viewer stream');
          return;
        }
        
        let audioEl = viewerAudioElements.current.get(call.peer);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          viewerAudioContainerRef.current?.appendChild(audioEl);
          viewerAudioElements.current.set(call.peer, audioEl);
        }
        
        audioEl.srcObject = remoteStream;
        audioEl.muted = isSpeakerMuted;
        audioEl.autoplay = true;
        
        audioEl.play().then(() => {
          console.log('Viewer audio playing successfully');
        }).catch(err => {
          console.log('Viewer audio autoplay blocked:', err);
        });
        
        setHasViewerAudio(true);
        setIsViewerAudioEnabled(true);
        toast.success('Viewer microphone connected');
      });

      call.on('close', () => {
        console.log('Viewer audio call closed:', call.peer);
        cleanupViewerAudio(call.peer);
      });
    };

    peer.on('call', handleCall);

    return () => {
      peer.off('call', handleCall);
    };
  }, [isSpeakerMuted, cleanupViewerAudio]);

  const value: ScreenShareContextValue = {
    roomId,
    status,
    isSharing,
    viewerCount,
    error,
    isMicOn,
    recentActivity,
    mutedViewers,
    hasViewerAudio,
    isViewerAudioEnabled,
    isSpeakerMuted,
    connectedViewerIds,
    videoRef,
    viewerAudioContainerRef,
    initializeRoom,
    startSharing,
    stopSharing,
    endMeeting,
    toggleMic,
    muteViewer,
    unmuteViewer,
    enableViewerAudio,
    toggleSpeakerMute,
    copyViewerLink,
    toggleFullscreen,
    hasViewerAudioElement,
  };

  return (
    <ScreenShareContext.Provider value={value}>
      {/* Persistent audio container for viewer streams */}
      <div ref={viewerAudioContainerRef} className="sr-only" aria-hidden="true" />
      {children}
    </ScreenShareContext.Provider>
  );
};
