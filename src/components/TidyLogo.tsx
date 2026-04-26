import tidyLogo from "@/assets/tidy-logo.png";

const TidyLogo = ({ size = "md", withBackground = false }: { size?: "sm" | "md" | "lg"; withBackground?: boolean }) => {
  // withBackground prop kept for API compatibility but no longer renders a white circle —
  // the logo now floats directly on the surface for a cleaner, larger presence.
  const sizes = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-64 h-64 md:w-72 md:h-72",
  };

  return (
    <img
      src={tidyLogo}
      alt="Tidy Home Concierge"
      className={`${sizes[size]} object-contain drop-shadow-[0_8px_24px_rgba(15,23,42,0.18)]`}
    />
  );
};

export default TidyLogo;
