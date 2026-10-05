import FadeIn from "./FadeIn";
import { useLanguage } from "@/contexts/LanguageContext";
import { BriefcaseBusiness, House, Plane } from "lucide-react";
import familyPhoto from "@/assets/who-its-for-family.png.asset.json";

const personas = [
  {
    Icon: BriefcaseBusiness,
    title: "Busy Professionals",
    desc: "No time to manage 3 different vendors. One plan handles everything on autopilot while you focus on what matters.",
  },
  {
    Icon: House,
    title: "Families",
    desc: "Keep your home consistently maintained without it falling on any one person. Reliable service, every single visit.",
  },
  {
    Icon: Plane,
    title: "Homeowners Who Travel",
    desc: "Away for the week or the season? Your home still gets serviced on schedule, and you see the photos after every visit.",
  },
];

const WhoItsFor = () => {
  const { t } = useLanguage();
  return (
    <section className="who-showcase">
      <div className="who-showcase-grid">
        <div className="who-showcase-photo">
          <img src={familyPhoto.url} alt={t("Family relaxing together in their home")} loading="lazy" />
        </div>
        <div className="who-showcase-copy">
          <FadeIn>
            <span className="who-showcase-eyebrow">{t("Who it's for")}</span>
            <h2>{t("Built for homeowners who want it handled.")}</h2>
            <p className="who-showcase-intro">{t("If you'd rather spend your weekend doing anything but managing vendors, Tidy is for you.")}</p>
          </FadeIn>

          <div className="who-showcase-list">
          {personas.map(({ Icon, title, desc }, i) => (
            <FadeIn key={title} delay={i * 120}>
              <div className="who-showcase-persona text-left">
                <span className="who-showcase-icon"><Icon aria-hidden="true" /></span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(desc)}</p>
                </div>
              </div>
            </FadeIn>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhoItsFor;
