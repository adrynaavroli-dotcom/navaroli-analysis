import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import ThesisDetail from "./pages/ThesisDetail";
import About from "./pages/About";
import Contact from "./pages/Contact";
import ValuationEngine from "./pages/ValuationEngine";
import OptionsPricing from "./pages/OptionsPricing";
import PublicThesis from "./pages/PublicThesis";
import PublicThesesList from "./pages/PublicThesesList";
import MacroDashboard from "./pages/MacroDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/thesis/:id" element={<ThesisDetail />} />
            <Route path="/research" element={<PublicThesesList />} />
            <Route path="/public-thesis/:ticker" element={<PublicThesis />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/valuation-engine" element={<ValuationEngine />} />
            <Route path="/options-pricing" element={<OptionsPricing />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
