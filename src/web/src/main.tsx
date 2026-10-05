import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { useLocale } from "@/i18n/index.ts";
import { App } from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// The server is local, so keep retries short; updates arrive over SSE
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
});

/** Re-mounts the app when the language changes. View state lives in the URL, so nothing is lost. */
function Root() {
  const locale = useLocale();
  document.documentElement.lang = locale;
  return <App key={locale} />;
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <Root />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
