import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

const DemoPageB = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-primary/50">
        <CardHeader className="text-center">
          <CardTitle className="text-6xl font-bold text-destructive mb-4">
            Demo Page B
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p className="text-xl text-muted-foreground">
            This is Page B. Navigate back to Page A to continue testing screen share persistence.
          </p>
          
          <div className="p-4 bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive">
              Screen sharing should still be active! Viewers see this page now.
            </p>
          </div>

          <Button asChild size="lg" className="w-full" variant="secondary">
            <Link to="/demo/page-a" className="flex items-center justify-center gap-2">
              <ArrowLeft className="w-5 h-5" />
              Go to Page A
            </Link>
          </Button>
          
          <div className="pt-4 border-t">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DemoPageB;
