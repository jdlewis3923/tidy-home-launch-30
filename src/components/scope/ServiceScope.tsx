import { useMemo, useState } from "react";
import { Check, X, Plus, ClipboardList, Droplets, Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UTILITY_USE } from "@/lib/utility-use";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { VISIT_RULES } from "@/lib/visitRules";
import BeforeYouBook, { type ReviewProps } from './BeforeYouBook';
import {
  GROUP_NAME, GROUP_SCOPES, SCOPE_TITLE, grp, checkboxText, txt, useServiceScope,
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

export { checkboxText } from '@/lib/serviceScope';

/** One required checkbox per selected service, plus the short "How visits work" link. */
export function ScopeAcceptChecks(props: ReviewProps) {
  return <BeforeYouBook {...props} />;
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

/** Utility availability is a fact, never optional permission to use it. */
export function UtilityQuestion({ kind, value, onChange }: { kind: 'water' | 'outlet'; value: boolean | null; onChange: (v: boolean) => void }) {
  const { language } = useLanguage();
  const copy = UTILITY_USE[language === 'es' ? 'es' : 'en'];
  const question = kind === 'water' ? copy.waterQuestion : copy.outletQuestion;
  return (
    <fieldset className="rounded-lg border-2 border-border bg-card p-3">
      <legend className="px-1 text-sm font-bold text-ink">{question}</legend>
      <p className="mt-1 text-xs text-ink-soft">{kind === "water" ? copy.waterHelp : copy.help}</p>
      <div className="booking-utility-segments mt-2" role="radiogroup" aria-label={question}>
        {([true, false] as const).map((v) => (
          <Button key={String(v)} type="button" variant="outline" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className="font-semibold">
            {v ? L(language, "Yes", "Sí") : "No"}
          </Button>
        ))}
      </div>
      {value === false && <p className="mt-1 text-xs text-ink-soft">{kind === 'water' ? copy.noWater : copy.noOutlet}</p>}
    </fieldset>
  );
}
export function SpigotQuestion(props: { value: boolean | null; onChange: (v: boolean) => void }) {
  return <UtilityQuestion kind="water" {...props} />;
}
export function OutletQuestion(props: { value: boolean | null; onChange: (v: boolean) => void }) {
  return <UtilityQuestion kind="outlet" {...props} />;
}
