import { useParams } from 'react-router-dom';
import ScreenShareViewer from '@/components/ScreenShareViewer';
import { peerConfig } from '@/webrtc/peerConfig';

const Viewer = () => {
  const { roomId } = useParams<{ roomId: string }>();

  if (!roomId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Invalid room ID</p>
      </div>
    );
  }

  return <ScreenShareViewer roomId={roomId} peerConfig={peerConfig} />;
};

export default Viewer;
