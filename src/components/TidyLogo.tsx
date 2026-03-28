import tidyLogo from "@/assets/tidy-logo.png";

const TidyLogo = ({ size = "md", withBackground = false }: { size?: "sm" | "md" | "lg"; withBackground?: boolean }) => {
  const sizes = {
    sm: { img: "w-8 h-8", bg: "w-12 h-12" },
    md: { img: "w-11 h-11", bg: "w-16 h-16" },
    lg: { img: "w-16 h-16", bg: "w-24 h-24" },
  };
  const s = sizes[size];

  if (withBackground) {
    return (
      <div className={`${s.bg} rounded-full bg-white flex items-center justify-center shadow-md`}>
        <img src={tidyLogo} alt="Tidy Home Concierge" className={`${s.img} object-contain`} />
      </div>
    );
  }

  return <img src={tidyLogo} alt="Tidy Home Concierge" className={`${s.img} object-contain`} />;
};

export default TidyLogo;
