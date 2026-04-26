/**
 * Route-level Suspense fallback. Calm cream wash + bouncing dots.
 * Used by lazy-loaded routes so users never see a blank flash.
 */
export default function RouteFallback() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="flex items-end gap-1.5" aria-label="Loading">
        <span
          className="h-2 w-2 rounded-full bg-[hsl(var(--primary))] animate-billing-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-[hsl(var(--primary))] animate-billing-bounce"
          style={{ animationDelay: '140ms' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-[hsl(var(--primary))] animate-billing-bounce"
          style={{ animationDelay: '280ms' }}
        />
      </div>
    </div>
  );
}
