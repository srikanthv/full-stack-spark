import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScreenShareProvider } from "@/contexts/ScreenShareContext";
import Index from "./pages/Index";
import Presenter from "./pages/Presenter";
import PresenterControlsPage from "./pages/PresenterControlsPage";
import Viewer from "./pages/Viewer";
import DemoPageA from "./pages/DemoPageA";
import DemoPageB from "./pages/DemoPageB";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScreenShareProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/presenter/:roomId" element={<Presenter />} />
            <Route path="/presenter-controls" element={<PresenterControlsPage />} />
            <Route path="/viewer/:roomId" element={<Viewer />} />
            <Route path="/demo/page-a" element={<DemoPageA />} />
            <Route path="/demo/page-b" element={<DemoPageB />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ScreenShareProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
