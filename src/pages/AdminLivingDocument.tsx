import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import logo from "@/assets/tidy-official-logo.png";
import { LIVING_DOCS, buildDoc, docPlainText, docUpdatedAt, type DocSources, type Lang } from "@/lib/livingDocs";
import type { ScopeRow } from "@/lib/serviceScope";

export async function loadDocSources(): Promise<DocSources> {
  const [scope, contracts] = await Promise.all([
    supabase.from("service_scope").select("*").eq("active", true),
    supabase.from("contract_templates").select("service, lang, version, body, created_at, is_current"),
  ]);
  return { scope: (scope.data ?? []) as unknown as ScopeRow[], contracts: (contracts.data ?? []) as DocSources["contracts"] };
}

/** Writes each living document's plain text (EN + ES) into company_documents for admin search. */
export async function syncLivingDocSearch(src: DocSources, only?: string) {
  for (const def of LIVING_DOCS.filter((d) => !only || d.slug === only)) {
    const en = buildDoc(def, src, "en"), es = buildDoc(def, src, "es");
    const row = {
      doc_key: `living:${def.slug}`, filename: `${def.title[0]}`, title: def.title[0], category: "Living documents",
      tags: ["living", def.category.toLowerCase()], storage_path: `living/${def.slug}`, mime_type: "text/html",
      current_version: true, searchable_text: `${docPlainText(en)}\n${docPlainText(es)}`, description: def.title[1],
    };
    const { data } = await supabase.from("company_documents").select("id").eq("doc_key", row.doc_key).maybeSingle();
    if (data?.id) await supabase.from("company_documents").update(row).eq("id", data.id);
    else await supabase.from("company_documents").insert(row);
  }
}

export default function AdminLivingDocument() {
  const { slug } = useParams();
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [lang, setLang] = useState<Lang>("en");
  const [src, setSrc] = useState<DocSources | null>(null);
  const def = LIVING_DOCS.find((d) => d.slug === slug);

  useEffect(() => {
    if (!hasRole || !def) return;
    loadDocSources().then((s) => { setSrc(s); void syncLivingDocSearch(s, def.slug); });
  }, [hasRole, def]);

  const doc = useMemo(() => (def && src ? buildDoc(def, src, lang) : null), [def, src, lang]);
  if (isLoading) return null;
  if (!hasRole) return <Navigate to="/admin" replace />;
  if (!def) return <Navigate to="/admin/documents" replace />;
  const updated = src ? new Date(docUpdatedAt(src)).toLocaleDateString(lang === "en" ? "en-US" : "es-US", { year: "numeric", month: "long", day: "numeric" }) : "";

  return (
    <div className="living-doc min-h-screen bg-background">
      <Helmet><title>{def.title[0]} · Tidy documents</title><meta name="robots" content="noindex" /></Helmet>
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-4">
        <Link to="/admin/documents" className="mr-auto inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Documents</Link>
        <Button variant={lang === "en" ? "default" : "outline"} size="sm" onClick={() => setLang("en")}>English</Button>
        <Button variant={lang === "es" ? "default" : "outline"} size="sm" onClick={() => setLang("es")}>Español</Button>
        <Button size="sm" onClick={() => window.print()} data-download-pdf><Download className="mr-1 h-4 w-4" />{lang === "en" ? "Download PDF" : "Descargar PDF"}</Button>
      </div>
      {!doc ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <article className="ld-page mx-auto max-w-4xl">
          <header className="ld-mast"><img src={logo} alt="Tidy" /><div><h1>{doc.title}</h1><p>{lang === "en" ? "Updated" : "Actualizado"} {updated}</p></div></header>
          <div className="ld-body">
            {doc.sections.map((s, i) => (
              <section key={i}>
                <h2 className="ld-bar">{s.heading}</h2>
                {s.blocks.map((b, j) => b.kind === "p" ? <p key={j}>{b.text}</p>
                  : b.kind === "list" ? <ul key={j}>{b.items.map((x, k) => <li key={k}>{x}</li>)}</ul>
                  : <table key={j}><thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m}>{c}</td>)}</tr>)}</tbody></table>)}
              </section>
            ))}
          </div>
          <footer className="ld-foot">Tidy Home Concierge · (786) 829-1141 · hello@jointidy.co <span className="ld-pg" /></footer>
        </article>
      )}
    </div>
  );
}

// Document palette is Tidy brand print colours, scoped to this printable page.
const PRINT_CSS = `
.living-doc{--ld-navy:hsl(222 47% 11%);--ld-blue:hsl(221 83% 53%);--ld-gold:hsl(48 91% 52%)}
.ld-page{background:hsl(0 0% 100%);color:var(--ld-navy);font-size:15px;line-height:1.55;box-shadow:0 1px 8px hsl(222 47% 11% / .15)}
.ld-mast{background:var(--ld-navy);color:hsl(0 0% 100%);display:flex;gap:16px;align-items:center;padding:20px 28px;border-bottom:5px solid var(--ld-gold)}
.ld-mast img{height:64px;width:64px;object-fit:contain}.ld-mast h1{font-size:24px;font-weight:700;margin:0}.ld-mast p{margin:2px 0 0;opacity:.8;font-size:13px}
.ld-body{padding:20px 28px 40px}.ld-bar{background:var(--ld-blue);color:hsl(0 0% 100%);font-weight:700;font-size:15px;padding:6px 12px;margin:22px 0 10px;border-radius:3px;break-after:avoid}
.ld-body ul{list-style:disc;padding-left:22px}.ld-body li{margin:4px 0}.ld-body p{margin:6px 0}
.ld-body table{width:100%;border-collapse:collapse;margin:8px 0;break-inside:avoid}.ld-body th{background:var(--ld-navy);color:hsl(0 0% 100%);text-align:left;padding:6px 8px;font-size:13px}.ld-body td{border-bottom:1px solid hsl(220 13% 88%);padding:6px 8px}
.ld-foot{background:var(--ld-navy);color:hsl(0 0% 100%);font-size:12px;padding:10px 28px;display:flex;justify-content:space-between}
@media print{
  @page{size:letter;margin:0.5in 0.4in 0.7in;@bottom-center{content:"Tidy Home Concierge · Page " counter(page) " of " counter(pages);background:hsl(222 47% 11%);color:hsl(0 0% 100%);font-size:10px;width:100%}}
  body *{visibility:hidden}.living-doc,.living-doc *{visibility:visible}.living-doc{position:absolute;inset:0;background:hsl(0 0% 100%)}
  .no-print{display:none!important}.ld-page{box-shadow:none;max-width:none;font-size:13pt}
  .ld-mast,.ld-bar,.ld-body th,.ld-foot{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ld-foot{position:fixed;bottom:0;left:0;right:0}
}`;
