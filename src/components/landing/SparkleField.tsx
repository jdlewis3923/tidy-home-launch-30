/**
 * Decorative sparkles that float over dark hero/CTA sections.
 * Mirrors the sparkles used in the homepage Hero. Pure decoration —
 * aria-hidden, respects prefers-reduced-motion via the global rule on
 * .animate-sparkle in index.css.
 */
const SparkleField = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
    <div className="absolute top-16 left-[12%] animate-sparkle">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z"
          fill="white"
          fillOpacity="0.4"
        />
      </svg>
    </div>
    <div
      className="absolute top-32 right-[18%] animate-sparkle"
      style={{ animationDelay: "1.5s" }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z"
          fill="white"
          fillOpacity="0.3"
        />
      </svg>
    </div>
    <div
      className="absolute bottom-24 left-[22%] animate-sparkle"
      style={{ animationDelay: "3s" }}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z"
          fill="white"
          fillOpacity="0.35"
        />
      </svg>
    </div>
    <div
      className="absolute bottom-16 right-[14%] animate-sparkle"
      style={{ animationDelay: "2.2s" }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z"
          fill="white"
          fillOpacity="0.32"
        />
      </svg>
    </div>
  </div>
);

export default SparkleField;
