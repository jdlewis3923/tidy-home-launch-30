import tidyLogo from "@/assets/tidy-logo.png";
import tidyLogoWebp from "@/assets/tidy-logo.webp";

/**
 * The source mark is 600×362. Every size below therefore sets a height and
 * leaves the width automatic — the old `lg` variant forced a square box, which
 * reserved empty space and shifted layout once the image decoded. Intrinsic
 * width/height are declared so the browser reserves the correct ratio.
 */
const TidyLogo = ({ size = "md", withBackground = false }: { size?: "sm" | "md" | "lg"; withBackground?: boolean }) => {
  // withBackground prop kept for API compatibility but no longer renders a white circle —
  // the logo now floats directly on the surface for a cleaner, larger presence.
  const sizes = {
    sm: "h-12 w-auto",
    md: "h-20 md:h-24 w-auto",
    lg: "h-40 md:h-44 w-auto",
  };

  return (
    <picture>
      <source srcSet={tidyLogoWebp} type="image/webp" />
      <img
        src={tidyLogo}
        alt="Tidy Home Concierge"
        width={600}
        height={362}
        loading="lazy"
        decoding="async"
        className={`${sizes[size]} object-contain`}
      />
    </picture>
  );
};

export default TidyLogo;
