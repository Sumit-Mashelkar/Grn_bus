import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import AuthCallback from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";

function AppRouter() {
  const location = useLocation();
  // Handle Emergent OAuth callback synchronously
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Home />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
