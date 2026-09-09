import tidyLogo from "@/assets/tidy-logo-trimmed.png";
import tidyLogoWebp from "@/assets/tidy-logo-trimmed.webp";

/**
 * The original export was 600×362 but the mark itself only filled a 212×177
 * region in the middle — so every height we set was mostly empty space and the
 * badge looked tiny. This uses the trimmed 212×177 mark, so the height we set
 * is the height the badge actually renders at.
 */
const TidyLogo = ({ size = "md", withBackground = false, priority = false }: { size?: "nav" | "sm" | "md" | "lg"; withBackground?: boolean; priority?: boolean }) => {
  // withBackground prop kept for API compatibility but no longer renders a white circle —
  // the logo now floats directly on the surface for a cleaner, larger presence.
  const sizes = {
    nav: "h-12 sm:h-14 md:h-16 w-auto",
    sm: "h-9 w-auto",
    md: "h-14 md:h-16 w-auto",
    lg: "h-20 md:h-24 w-auto",
  };

  return (
    <picture>
      <source srcSet={tidyLogoWebp} type="image/webp" />
      <img
        src={tidyLogo}
        alt="Tidy Home Concierge"
        width={212}
        height={177}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={`${sizes[size]} max-w-none shrink-0 object-contain`}
      />
    </picture>
  );
};

export default TidyLogo;
