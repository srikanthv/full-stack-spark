import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

const DemoPageA = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-6xl font-bold text-primary mb-4">
            Demo Page A
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p className="text-xl text-muted-foreground">
            This is Page A. Navigate to Page B to test that screen sharing continues across route changes.
          </p>
          
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              If you're sharing "This Tab", viewers should see this page update as you navigate.
            </p>
          </div>

          <Button asChild size="lg" className="w-full">
            <Link to="/demo/page-b" className="flex items-center justify-center gap-2">
              Go to Page B
              <ArrowRight className="w-5 h-5" />
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

export default DemoPageA;
