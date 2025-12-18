import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor, Users, ArrowRight } from 'lucide-react';

const Index = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const generateRoomId = () => {
    return Math.random().toString(36).substr(2, 8);
  };

  const handleCreateRoom = () => {
    const newRoomId = roomId.trim() || generateRoomId();
    navigate(`/presenter/${newRoomId}`);
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      navigate(`/viewer/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Screen Share</h1>
          <p className="text-muted-foreground">
            Share your screen with others using WebRTC
          </p>
        </div>

        {/* Room Input */}
        <Card>
          <CardHeader>
            <CardTitle>Room ID</CardTitle>
            <CardDescription>
              Enter a room ID or leave blank to generate one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Enter room ID (optional)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="mb-4"
            />
          </CardContent>
        </Card>

        {/* Action Cards */}
        <div className="grid gap-4">
          <Card 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={handleCreateRoom}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Monitor className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Start as Presenter</h3>
                    <p className="text-sm text-muted-foreground">
                      Share your screen with viewers
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-colors ${roomId.trim() ? 'hover:border-primary' : 'opacity-50 cursor-not-allowed'}`}
            onClick={handleJoinRoom}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-secondary rounded-lg">
                    <Users className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Join as Viewer</h3>
                    <p className="text-sm text-muted-foreground">
                      {roomId.trim() ? 'Watch the presenter\'s screen' : 'Enter a room ID first'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info */}
        <p className="text-xs text-center text-muted-foreground">
          Powered by PeerJS &amp; WebRTC. Works in Chrome and Edge.
        </p>
      </div>
    </div>
  );
};

export default Index;
