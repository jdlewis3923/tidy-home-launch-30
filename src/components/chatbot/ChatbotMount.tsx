// Mounts the chatbot only on whitelisted routes (homepage + customer dashboard).
import { useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";

const ChatbotWidget = lazy(() => import("./ChatbotWidget"));

const ALLOWED_PATHS = new Set<string>(["/", "/dashboard"]);

export default function ChatbotMount() {
  const { pathname } = useLocation();
  if (!ALLOWED_PATHS.has(pathname)) return null;
  return (
    <Suspense fallback={null}>
      <ChatbotWidget />
    </Suspense>
  );
}
