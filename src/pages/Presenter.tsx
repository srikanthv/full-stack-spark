import { useParams } from 'react-router-dom';
import ScreenSharePresenter from '@/components/ScreenSharePresenter';

const Presenter = () => {
  const { roomId } = useParams<{ roomId: string }>();

  if (!roomId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Invalid room ID</p>
      </div>
    );
  }

  return <ScreenSharePresenter roomId={roomId} />;
};

export default Presenter;
