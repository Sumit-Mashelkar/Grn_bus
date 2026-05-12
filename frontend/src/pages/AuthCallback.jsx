import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "@/lib/api";
import { Loader2 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      navigate("/", { replace: true });
      return;
    }
    const session_id = m[1];
    (async () => {
      try {
        const data = await post("/auth/session", { session_id });
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: data.user } });
      } catch (e) {
        console.error("Auth failed", e);
        navigate("/", { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground" data-testid="auth-callback">
      <Loader2 className="w-8 h-8 animate-spin mb-3" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
