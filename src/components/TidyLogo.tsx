import tidyLogo from "@/assets/tidy-logo.png";

const TidyLogo = ({ size = "md", withBackground = false }: { size?: "sm" | "md" | "lg"; withBackground?: boolean }) => {
  // withBackground prop kept for API compatibility but no longer renders a white circle —
  // the logo now floats directly on the surface for a cleaner, larger presence.
  const sizes = {
    sm: "h-12 w-auto",
    md: "h-20 md:h-24 w-auto",
    lg: "w-64 h-64 md:w-72 md:h-72",
  };

  return (
    <img
      src={tidyLogo}
      alt="Tidy Home Concierge"
      className={`${sizes[size]} object-contain`}
    />
  );
};

export default TidyLogo;
