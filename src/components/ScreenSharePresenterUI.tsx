import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Users, StopCircle, Play, Copy, Check, Mic, MicOff, Maximize, Radio, UserPlus, UserMinus, XCircle, Volume2, VolumeX } from 'lucide-react';
import { useScreenShare } from '@/contexts/ScreenShareContext';

interface ScreenSharePresenterUIProps {
  roomId: string;
}

const ScreenSharePresenterUI = ({ roomId }: ScreenSharePresenterUIProps) => {
  const [copied, setCopied] = useState(false);
  
  const {
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
    initializeRoom,
    startSharing,
    stopSharing,
    endMeeting,
    toggleMic,
    muteViewer,
    unmuteViewer,
    enableViewerAudio,
    toggleSpeakerMute,
    toggleFullscreen,
    hasViewerAudioElement,
  } = useScreenShare();

  // Initialize room when component mounts or roomId changes
  useEffect(() => {
    initializeRoom(roomId);
  }, [roomId, initializeRoom]);

  const handleCopyViewerLink = () => {
    const link = `${window.location.origin}/viewer/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            {status === 'sharing' && (
              <Badge variant="default" className="flex items-center gap-1.5 bg-red-500 hover:bg-red-500">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </Badge>
            )}
            <Badge variant={status === 'sharing' ? 'default' : 'secondary'}>
              {status === 'connecting' && 'Connecting...'}
              {status === 'idle' && 'Initializing...'}
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
              <Button variant="ghost" size="sm" onClick={handleCopyViewerLink}>
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
                  const hasAudio = hasViewerAudioElement(viewerId);
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

export default ScreenSharePresenterUI;
