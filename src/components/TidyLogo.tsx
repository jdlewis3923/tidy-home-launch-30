import tidyLogo from "@/assets/tidy-logo.png";

const TidyLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };
  return (
    <img src={tidyLogo} alt="Tidy Home Concierge" className={`${sizes[size]} object-contain`} />
  );
};

export default TidyLogo;
