import { useMemo, useState } from "react";
import { Check, X, Plus, ClipboardList, Droplets, Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { VISIT_RULES } from "@/lib/visitRules";
import BeforeYouBook, { type ReviewProps } from './BeforeYouBook';
import {
  GROUP_NAME, GROUP_SCOPES, SCOPE_TITLE, grp, isCarGroup, txt, useServiceScope,
  type ScopeGroup, type ScopeRow, type ScopeService,
} from "@/lib/serviceScope";

const L = (lang: string, en: string, es: string) => (lang === "es" ? es : en);

function notices(rows: ScopeRow[], scopes: ScopeService[], opts: { monthlyLawn?: boolean; weekly?: boolean }) {
  return rows.filter((r) => scopes.includes(r.service) && r.section === "notice" && (
    (r.notice_key === "monthly_growth" && opts.monthlyLawn) ||
    r.notice_key === "wash_interior_line" || r.notice_key === "water" ||
    (r.notice_key === "deep_clean_when" && opts.weekly !== false) || r.notice_key === "detail_when"))
    // water notice appears once even when two car scopes are shown
    .filter((r, i, all) => all.findIndex((x) => x.notice_key === r.notice_key) === i);
}

function NoticeBox({ row, lang }: { row: ScopeRow; lang: string }) {
  const Icon = row.notice_key === "water" ? Droplets : Info;
  return (
    <p className="flex gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-[13px] leading-snug text-ink">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
      <span>{txt(row, lang)}</span>
    </p>
  );
}

function List({ rows, lang, icon }: { rows: ScopeRow[]; lang: string; icon: "yes" | "no" | "add" | "must" }) {
  let last: string | null = null;
  const Icon = icon === "yes" ? Check : icon === "no" ? X : icon === "add" ? Plus : ClipboardList;
  const color = icon === "yes" ? "text-emerald-600" : icon === "no" ? "text-destructive" : "text-primary";
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const g = grp(r, lang);
        const head = g && g !== last ? ((last = g), <li key={r.id + "g"} className="pt-1 text-[12px] font-bold uppercase tracking-wide text-ink-soft">{g}</li>) : null;
        return [head, (
          <li key={r.id} className="flex gap-2 text-[13px] leading-snug text-ink">
            <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${color}`} strokeWidth={2.5} aria-hidden />
            <span>{txt(r, lang)}</span>
          </li>
        )];
      })}
    </ul>
  );
}

/** Full scope for one scope service: Included / Not included, then Add-ons, then You need to. */
export function ScopeBlock({ service, rows, lang, opts = {} }: { service: ScopeService; rows: ScopeRow[]; lang: string; opts?: { monthlyLawn?: boolean; weekly?: boolean } }) {
  const mine = rows.filter((r) => r.service === service);
  if (!mine.length) return null;
  const by = (s: string) => mine.filter((r) => r.section === s);
  return (
    <section className="space-y-3">
      <h3 className="text-base font-extrabold text-ink">{SCOPE_TITLE[service][lang === "es" ? 1 : 0]}</h3>
      {notices(mine, [service], opts).map((n) => <NoticeBox key={n.id} row={n} lang={lang} />)}
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-1.5 text-sm font-bold text-ink">{L(lang, "Included", "Incluido")}</p><List rows={by("included")} lang={lang} icon="yes" /></div>
        <div><p className="mb-1.5 text-sm font-bold text-ink">{L(lang, "Not included", "No incluido")}</p><List rows={by("not_included")} lang={lang} icon="no" /></div>
      </div>
      {by("add_on").length > 0 && <div><p className="mb-1.5 text-sm font-bold text-ink">{L(lang, "Add-ons", "Servicios adicionales")}</p><List rows={by("add_on")} lang={lang} icon="add" /></div>}
      {by("customer_must").length > 0 && <div><p className="mb-1.5 text-sm font-bold text-ink">{L(lang, "You need to", "Usted debe")}</p><List rows={by("customer_must")} lang={lang} icon="must" /></div>}
    </section>
  );
}

export function ScopeFull({ group, rows: given, opts = {} }: { group: ScopeGroup; rows?: ScopeRow[]; opts?: { monthlyLawn?: boolean; weekly?: boolean } }) {
  const { language } = useLanguage();
  const q = useServiceScope();
  const rows = given ?? q.data ?? [];
  if (!rows.length) return <p className="text-sm text-ink-soft">{L(language, "Loading what's included…", "Cargando lo que incluye…")}</p>;
  const scopes = GROUP_SCOPES[group].filter((s) => s !== "cleaning_deep_clean" || opts.weekly !== false);
  return <div className="space-y-6">{scopes.map((s) => <ScopeBlock key={s} service={s} rows={rows} lang={language} opts={opts} />)}</div>;
}

/** Summary under a service: top 4 included lines + required notices + "See everything" sheet. */
export function ScopeSummary({ group, monthlyLawn, weekly, compact }: { group: ScopeGroup; monthlyLawn?: boolean; weekly?: boolean; compact?: boolean }) {
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useServiceScope();
  const base = GROUP_SCOPES[group][0];
  const top = useMemo(() => rows.filter((r) => r.service === base && r.section === "included").slice(0, 4), [rows, base]);
  const scopes = GROUP_SCOPES[group];
  const shown = notices(rows, scopes, { monthlyLawn, weekly }).filter((n) => n.notice_key !== "deep_clean_when" && n.notice_key !== "detail_when");
  const name = GROUP_NAME[group][language === "es" ? 1 : 0];
  return (
    <div className={`space-y-2 ${compact ? "" : "mt-3"}`} data-scope-summary={group}>
      <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft">{L(language, "What's included", "Qué incluye")}</p>
      <ul className="space-y-1">
        {top.map((r) => (
          <li key={r.id} className="flex gap-2 text-[13px] leading-snug text-ink">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden />
            <span className="line-clamp-2">{txt(r, language)}</span>
          </li>
        ))}
      </ul>
      {shown.map((n) => <NoticeBox key={n.id} row={n} lang={language} />)}
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className="min-h-[44px] text-left text-sm font-bold text-primary underline underline-offset-4">
        {L(language, "See everything included and not included", "Ver todo lo que incluye y no incluye")}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={`founding-landing overflow-y-auto bg-background text-ink ${isMobile ? "max-h-[88vh] rounded-t-2xl" : "w-full sm:max-w-3xl"}`}>
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-xl font-extrabold text-ink">{name}</SheetTitle>
            <SheetDescription className="text-ink-soft">{L(language, "Exactly what each visit includes and doesn't.", "Exactamente lo que incluye y no incluye cada visita.")}</SheetDescription>
          </SheetHeader>
          <ScopeFull group={group} opts={{ monthlyLawn, weekly }} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function checkboxText(group: ScopeGroup, lang: string) {
  const name = GROUP_NAME[group][lang === "es" ? 1 : 0];
  if (isCarGroup(group)) {
    return group === "car_care"
      ? L(lang, "I've read what's included and not included in Car Care, and I agree my Pro may use my outdoor water spigot.", "Leí lo que incluye y no incluye Cuidado del Auto, y acepto que mi Pro use mi llave de agua exterior.")
      : L(lang, "I've read what's included and not included in the Car Wash Add-On, and I agree my Pro may use my outdoor water spigot.", "Leí lo que incluye y no incluye el lavado de auto adicional, y acepto que mi Pro use mi llave de agua exterior.");
  }
  return L(lang, `I've read what's included and not included in ${name}.`, `Leí lo que incluye y no incluye ${name}.`);
}

/** One required checkbox per selected service, plus the short "How visits work" link. */
export function ScopeAcceptChecks(props: ReviewProps) {
  return <BeforeYouBook {...props} />;
}

function LegacyScopeAcceptChecks({ groups, checked, onChange }: ReviewProps) {
  const { language } = useLanguage();
  const [rulesOpen, setRulesOpen] = useState(false);
  const isMobile = useIsMobile();
  if (!groups.length) return null;
  return (
    <div className="space-y-2.5 rounded-xl border-2 border-border bg-card p-3" data-scope-accept>
      {groups.map((g) => (
        <label key={g} className="flex min-h-[44px] cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-1 h-5 w-5 flex-shrink-0 accent-primary" checked={!!checked[g]}
            onChange={(e) => onChange({ ...checked, [g]: e.target.checked })} aria-label={checkboxText(g, language)} />
          <span className="text-[13px] leading-snug text-ink">{checkboxText(g, language)}</span>
        </label>
      ))}
      <button type="button" onClick={() => setRulesOpen(true)} className="min-h-[44px] text-left text-[13px] font-semibold text-primary underline underline-offset-4">
        {L(language, "How visits work: size checks, no access, redos and damage", "Así funcionan las visitas: tamaño, sin acceso, regresos y daños")}
      </button>
      <Sheet open={rulesOpen} onOpenChange={setRulesOpen}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={`founding-landing overflow-y-auto bg-background text-ink ${isMobile ? "max-h-[88vh] rounded-t-2xl" : "w-full sm:max-w-2xl"}`}>
          <SheetHeader className="mb-4 text-left"><SheetTitle className="text-xl font-extrabold text-ink">{L(language, "How visits work", "Así funcionan las visitas")}</SheetTitle></SheetHeader>
          <VisitRulesList />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function VisitRulesList() {
  const { language } = useLanguage();
  return (
    <ol className="space-y-3">
      {VISIT_RULES.map((r, i) => {
        const [h, b] = language === "es" ? r.es : r.en;
        return <li key={i} className="text-sm leading-relaxed text-ink"><b>{i + 1}. {h}.</b> {b}</li>;
      })}
    </ol>
  );
}

export const allScopeChecked = (groups: ScopeGroup[], checked: Partial<Record<ScopeGroup, boolean>>) => groups.length > 0 && groups.every((g) => checked[g]);

/** "Outdoor spigot at the parking spot?" Yes / No — No is never a fee or a no-access visit. */
export function SpigotQuestion({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const { language } = useLanguage();
  return (
    <fieldset className="rounded-xl border-2 border-border bg-card p-3">
      <legend className="px-1 text-sm font-bold text-ink">{L(language, "Outdoor spigot at the parking spot?", "¿Hay una llave de agua exterior donde se estaciona el auto?")}</legend>
      <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup">
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-xl border-2 px-3 text-sm font-semibold ${value === v ? "border-primary bg-primary/10 text-ink" : "border-border bg-card text-ink"}`}>
            {v ? L(language, "Yes", "Sí") : "No"}
          </button>
        ))}
      </div>
      {value === false && <p className="mt-1 text-xs text-ink-soft">{L(language, "No problem — your Pro brings their own water. Never a fee.", "No hay problema: su Pro trae su propia agua. Nunca hay cargo extra.")}</p>}
    </fieldset>
  );
}
