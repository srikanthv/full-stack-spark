import { useParams } from 'react-router-dom';
import ScreenSharePresenterUI from '@/components/ScreenSharePresenterUI';

const Presenter = () => {
  const { roomId } = useParams<{ roomId: string }>();

  if (!roomId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Invalid room ID</p>
      </div>
    );
  }

  return <ScreenSharePresenterUI roomId={roomId} />;
};

export default Presenter;
