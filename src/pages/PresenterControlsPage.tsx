import { useSearchParams } from 'react-router-dom';
import PresenterControls from '@/components/PresenterControls';
import { peerConfig } from '@/webrtc/peerConfig';

const PresenterControlsPage = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');

  if (!roomId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Invalid room ID</p>
      </div>
    );
  }

  return <PresenterControls roomId={roomId} peerConfig={peerConfig} />;
};

export default PresenterControlsPage;
