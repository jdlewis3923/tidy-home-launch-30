/**
 * Visit checklist — /pro/visit/:id/checklist
 * Ticks are the Pro's own record of the work; they never gate completion.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ProShell from "@/components/pro/portal/ProShell";
import { ChecklistItemRow, ErrorState, ScheduleSkeleton } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { fetchChecklist, toggleChecklistItem, type ChecklistRow } from "@/lib/pro-portal";
import CleaningStandardChecklist from '@/components/pro/CleaningStandardChecklist';
import ServiceVisitChecklist from '@/components/pro/ServiceVisitChecklist';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProChecklist() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const es = language === 'es';
  const { visits, me, loading: sessionLoading } = useProSession();
  const visit = visits.find((v) => v.id === id) ?? null;

  const [rows, setRows] = useState<ChecklistRow[] | null>(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!visit?.service_type || !id) return;
    let cancelled = false;
    setError(false);
    fetchChecklist(id, visit.service_type)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [id, visit?.service_type, nonce]);

  const sections = useMemo(() => {
    const map = new Map<string, ChecklistRow[]>();
    for (const r of rows ?? []) map.set(r.section, [...(map.get(r.section) ?? []), r]);
    return [...map.entries()];
  }, [rows]);

  const toggle = async (row: ChecklistRow) => {
    if (!id || !me?.pro_id) return;
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, checked: !r.checked } : r)) ?? prev);
    try {
      await toggleChecklistItem(id, row.id, me.pro_id, !row.checked);
    } catch {
      setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, checked: row.checked } : r)) ?? prev);
    }
  };

  const doneCount = (rows ?? []).filter((r) => r.checked).length;

  return (
    <ProShell title={es ? 'Lista de trabajo' : 'Checklist'} back={`/pro/visit/${id}`}>
      {id && visit && <div className="px-4"><ServiceVisitChecklist visitId={id}/></div>}
      {(sessionLoading || (!rows && !error)) && <ScheduleSkeleton />}
      {error && <ErrorState title="Couldn't load the checklist" onRetry={() => setNonce((n) => n + 1)} />}
      {rows && !error && (
        <>
          <p className="px-4 py-3 text-[14px] font-semibold text-[hsl(var(--pro-ink-soft))]">
            {es ? 'Lista adicional del servicio' : 'Additional service reference'} · {doneCount}/{rows.length}
          </p>
          <div className="space-y-4 px-4">
            {id&&visit?.service_type==='cleaning'&&<CleaningStandardChecklist visitId={id}/>}
            {sections.map(([section, items]) => (
              <section key={section}>
                <h2 className="px-1 pb-2 text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
                  {section}
                </h2>
                <div className="overflow-hidden rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)]">
                  {items.map((r) => (
                    <ChecklistItemRow
                      key={r.id}
                      label={r.label}
                      checked={r.checked}
                      onToggle={() => void toggle(r)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </ProShell>
  );
}
