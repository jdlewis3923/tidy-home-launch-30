const TidyLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: { outer: "w-10 h-10", text: "text-xs" },
    md: { outer: "w-14 h-14", text: "text-sm" },
    lg: { outer: "w-20 h-20", text: "text-lg" },
  };
  const s = sizes[size];
  return (
    <div className={`${s.outer} rounded-full bg-gradient-to-br from-primary to-primary-deep ring-[3px] ring-gold flex items-center justify-center`}>
      <span className={`${s.text} font-extrabold tracking-wider text-primary-foreground`}>TIDY</span>
    </div>
  );
};

export default TidyLogo;
