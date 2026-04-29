/**
 * Admin Documents Library — /admin/documents
 *
 * Single internal page where Justin can search, view, download, and print
 * every Tidy company document. Admin-only (non-admins get 403).
 *
 * Categories are fixed; new uploads pick from this list. Upload writes to the
 * private `company-docs` storage bucket and inserts a `company_documents` row.
 * Re-uploading a filename that matches an existing active doc archives the
 * old one (archive_reason='superseded') and inserts the new one as current.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import {
  Search,
  Upload,
  FileText,
  Download,
  Printer,
  Eye,
  Link as LinkIcon,
  Archive,
  ArrowLeft,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

// Preferred display order. Any extra categories present in the data
// (e.g. seeded "HR", "Operations", "Contracts", "Onboarding", "Brand")
// are appended automatically so seeded rows are never hidden.
const CATEGORIES = [
  "Contractor Onboarding",
  "Onboarding",
  "HR",
  "Contracts",
  "Signed Contracts",
  "Operations",
  "Operational",
  "Email Templates",
  "Financial + Strategy",
  "Brand",
  "Brand Assets",
] as const;
type Category = (typeof CATEGORIES)[number] | string;

type Doc = {
  id: string;
  filename: string;
  category: string;
  tags: string[];
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  current_version: boolean;
  uploaded_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  searchable_text: string | null;
};

type ArchiveFilter = "all" | "active" | "archived";

const formatBytes = (n: number | null): string => {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const AdminDocuments = () => {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArchiveFilter>("active");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ doc: Doc; url: string } | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_documents")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load documents", description: error.message, variant: "destructive" });
    } else {
      setDocs((data ?? []) as Doc[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasRole) void fetchDocs();
  }, [hasRole, fetchDocs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter === "active" && d.archived_at) return false;
      if (filter === "archived" && !d.archived_at) return false;
      if (!q) return true;
      const hay = `${d.filename} ${d.category} ${d.tags.join(" ")} ${d.searchable_text ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [docs, query, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Doc[]>();
    // Seed with the preferred order
    for (const c of CATEGORIES) map.set(c, []);
    // Add any categories actually present that aren't in the preferred list
    for (const d of filtered) {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    }
    return map;
  }, [filtered]);

  // Render order: preferred categories first (only if they have docs OR are
  // the canonical empty set), then any extras alphabetically.
  const orderedCategories = useMemo(() => {
    const preferred = CATEGORIES.filter((c) => (grouped.get(c)?.length ?? 0) > 0);
    const extras = Array.from(grouped.keys())
      .filter((k) => !CATEGORIES.includes(k as any) && (grouped.get(k)?.length ?? 0) > 0)
      .sort();
    return [...preferred, ...extras];
  }, [grouped]);

  const handleView = useCallback(async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from("company-docs")
      .createSignedUrl(doc.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open file", description: error?.message, variant: "destructive" });
      return;
    }
    setViewerDoc({ doc, url: data.signedUrl });
  }, []);

  const handleDownload = useCallback(async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from("company-docs")
      .createSignedUrl(doc.storage_path, 60, { download: doc.filename });
    if (error || !data?.signedUrl) {
      toast({ title: "Download failed", description: error?.message, variant: "destructive" });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const handlePrint = useCallback(async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from("company-docs")
      .createSignedUrl(doc.storage_path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not load file for printing", description: error?.message, variant: "destructive" });
      return;
    }
    const w = window.open(data.signedUrl, "_blank");
    if (w) {
      // Give the browser a beat to render before invoking print.
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          /* user can ctrl+P from the new tab */
        }
      }, 800);
    }
  }, []);

  const handleCopyLink = useCallback(async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from("company-docs")
      .createSignedUrl(doc.storage_path, 60 * 60 * 24);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not generate link", description: error?.message, variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(data.signedUrl);
      toast({ title: "Link copied", description: "Expires in 24 hours." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  }, []);

  const handleArchive = useCallback(async (doc: Doc) => {
    if (doc.archived_at) return;
    if (!confirm(`Archive "${doc.filename}"? It will be hidden from the active list.`)) return;
    const { error } = await supabase
      .from("company_documents")
      .update({ archived_at: new Date().toISOString(), archive_reason: "manual", current_version: false })
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Archive failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Archived", description: doc.filename });
    void fetchDocs();
  }, [fetchDocs]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!hasRole) {
    // Non-admins → 403-equivalent redirect.
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-black">
      <Helmet>
        <title>Documents Library — Tidy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
        <style>{`
          @media print {
            nav, header, .no-print { display: none !important; }
            body { background: white !important; color: black !important; }
          }
        `}</style>
      </Helmet>

      <header className="border-b border-white/10 bg-slate-900/60 backdrop-blur sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="text-white/70 hover:text-white">
              <Link to="/admin/kpis">
                <ArrowLeft className="h-4 w-4 mr-1" /> KPIs
              </Link>
            </Button>
            <h1 className="text-xl font-semibold">Documents Library</h1>
            <Badge variant="outline" className="border-amber-400/40 text-amber-300">Admin</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={async () => {
                const { data, error } = await supabase.functions.invoke("seed-company-documents", { body: {} });
                if (error || (data as any)?.error) {
                  toast({ title: "Seed failed", description: error?.message ?? (data as any)?.error, variant: "destructive" });
                  return;
                }
                toast({ title: "Seeded", description: `${(data as any)?.inserted ?? 0} added · ${(data as any)?.skipped_existing ?? 0} already present` });
                window.location.reload();
              }}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Seed Documents
            </Button>
            <Button
              onClick={() => setUploadOpen(true)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold"
            >
              <Upload className="h-4 w-4 mr-2" /> Add Document
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center gap-3 flex-wrap no-print">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename, tag, or content…"
              className="pl-9 bg-slate-900 border-white/10 text-white placeholder:text-white/40"
            />
          </div>
          <div className="flex gap-1 rounded-md bg-slate-900 border border-white/10 p-1">
            {(["all", "active", "archived"] as ArchiveFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs uppercase tracking-wide rounded ${
                  filter === f ? "bg-amber-400 text-slate-900 font-semibold" : "text-white/60 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="text-xs text-white/50">
            {loading ? "Loading…" : `${filtered.length} of ${docs.length}`}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-white/50" />
          </div>
        ) : (
          <div className="space-y-4">
            {orderedCategories.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-12">
                No documents match the current filter.
              </p>
            ) : (
              orderedCategories.map((cat) => {
                const items = grouped.get(cat) ?? [];
                return (
                  <CategoryCard
                    key={cat}
                    category={cat}
                    docs={items}
                    onView={handleView}
                    onDownload={handleDownload}
                    onPrint={handlePrint}
                    onCopyLink={handleCopyLink}
                    onArchive={handleArchive}
                  />
                );
              })
            )}
          </div>
        )}
      </main>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        existingDocs={docs}
        onUploaded={() => {
          setUploadOpen(false);
          void fetchDocs();
        }}
      />

      <ViewerModal
        viewer={viewerDoc}
        onClose={() => setViewerDoc(null)}
        onDownload={handleDownload}
        onPrint={handlePrint}
      />
    </div>
  );
};

// ---------- subcomponents ----------

const CategoryCard = ({
  category,
  docs,
  onView,
  onDownload,
  onPrint,
  onCopyLink,
  onArchive,
}: {
  category: string;
  docs: Doc[];
  onView: (d: Doc) => void;
  onDownload: (d: Doc) => void;
  onPrint: (d: Doc) => void;
  onCopyLink: (d: Doc) => void;
  onArchive: (d: Doc) => void;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <Card className="bg-slate-900/60 border-white/10">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-amber-300" />
              <span className="font-semibold text-white">{category}</span>
              <Badge variant="outline" className="border-white/15 text-white/70">{docs.length}</Badge>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-2">
            {docs.length === 0 ? (
              <p className="text-sm text-white/40 px-3 py-6 text-center">No documents in this category.</p>
            ) : (
              docs.map((d) => (
                <div
                  key={d.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    d.archived_at
                      ? "border-white/5 bg-slate-950/40 opacity-60"
                      : "border-white/10 bg-slate-950/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white truncate">{d.filename}</span>
                      {d.archived_at && (
                        <Badge variant="outline" className="border-white/20 text-white/60 text-[10px]">
                          archived
                        </Badge>
                      )}
                      {d.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      {formatDate(d.uploaded_at)} · {formatBytes(d.file_size_bytes)} · {d.mime_type ?? "unknown"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 no-print">
                    <Button size="sm" variant="ghost" onClick={() => onView(d)} className="text-white/80 hover:text-white">
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDownload(d)} className="text-white/80 hover:text-white">
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onPrint(d)} className="text-white/80 hover:text-white">
                      <Printer className="h-4 w-4 mr-1" /> Print
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onCopyLink(d)} className="text-white/80 hover:text-white">
                      <LinkIcon className="h-4 w-4 mr-1" /> Link
                    </Button>
                    {!d.archived_at && (
                      <Button size="sm" variant="ghost" onClick={() => onArchive(d)} className="text-white/50 hover:text-amber-300">
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

const UploadModal = ({
  open,
  onOpenChange,
  existingDocs,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  existingDocs: Doc[];
  onUploaded: () => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [category, setCategory] = useState<Category>("Contractor Onboarding");
  const [tagsInput, setTagsInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setFilename("");
      setTagsInput("");
      setCategory("Contractor Onboarding");
      setBusy(false);
    }
  }, [open]);

  const onPickFile = (f: File | null) => {
    setFile(f);
    if (f && !filename) setFilename(f.name);
  };

  const submit = async () => {
    if (!file || !filename.trim() || !category) {
      toast({ title: "Missing fields", description: "File, name, and category are required.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      // Archive any active doc with the same filename.
      const existing = existingDocs.find(
        (d) => d.filename.toLowerCase() === filename.trim().toLowerCase() && !d.archived_at,
      );
      if (existing) {
        await supabase
          .from("company_documents")
          .update({
            archived_at: new Date().toISOString(),
            archive_reason: "superseded",
            current_version: false,
          })
          .eq("id", existing.id);
      }

      // Storage path: category/timestamp-filename (collision-proof).
      const safeName = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${category.replace(/\s+/g, "_")}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("company-docs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      // Best-effort searchable_text: only for plaintext-ish files we can read in-browser.
      let searchable: string | null = null;
      const isText = /^(text\/|application\/(json|xml|x-yaml))/.test(file.type) ||
        /\.(md|txt|html|csv|json)$/i.test(filename);
      if (isText && file.size < 2 * 1024 * 1024) {
        try {
          searchable = await file.text();
        } catch {
          searchable = null;
        }
      }

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error: insErr } = await supabase.from("company_documents").insert({
        filename: filename.trim(),
        category,
        tags,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        current_version: true,
        uploaded_by: uid ?? null,
        searchable_text: searchable,
      });
      if (insErr) throw insErr;

      toast({
        title: existing ? "New version uploaded" : "Document added",
        description: existing ? `Previous "${filename}" archived as superseded.` : filename,
      });
      onUploaded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onPickFile(f);
            }}
            className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              drag ? "border-amber-300 bg-amber-300/10" : "border-white/15 bg-slate-950/40"
            }`}
          >
            {file ? (
              <div className="text-sm">
                <p className="font-medium">{file.name}</p>
                <p className="text-white/50 text-xs mt-1">{formatBytes(file.size)} · {file.type || "unknown"}</p>
                <Button variant="link" size="sm" onClick={() => setFile(null)} className="text-amber-300">
                  Choose different
                </Button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto text-white/40 mb-2" />
                <p className="text-sm text-white/60">Drop file here or</p>
                <label className="inline-block mt-2 text-amber-300 hover:underline cursor-pointer text-sm">
                  browse
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </>
            )}
          </div>

          <div>
            <label className="text-xs uppercase text-white/50">Filename</label>
            <Input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="bg-slate-950 border-white/10 mt-1"
              placeholder="e.g. Independent_Contractor_Agreement.pdf"
            />
          </div>

          <div>
            <label className="text-xs uppercase text-white/50">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="bg-slate-950 border-white/10 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs uppercase text-white/50">Tags (comma-separated)</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="bg-slate-950 border-white/10 mt-1"
              placeholder="ica, cleaning, v2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ViewerModal = ({
  viewer,
  onClose,
  onDownload,
  onPrint,
}: {
  viewer: { doc: Doc; url: string } | null;
  onClose: () => void;
  onDownload: (d: Doc) => void;
  onPrint: (d: Doc) => void;
}) => {
  if (!viewer) return null;
  const { doc, url } = viewer;
  const isPdf = (doc.mime_type ?? "").includes("pdf") || /\.pdf$/i.test(doc.filename);
  const isImage = (doc.mime_type ?? "").startsWith("image/");
  const isText = /\.(md|txt|html|csv|json)$/i.test(doc.filename) ||
    (doc.mime_type ?? "").startsWith("text/");

  return (
    <Dialog open={!!viewer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-5xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{doc.filename}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-slate-950 rounded-md overflow-hidden">
          {isPdf || isImage || isText ? (
            <iframe
              src={url}
              title={doc.filename}
              className="w-full h-full bg-white"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-white/60 gap-3 p-6 text-center">
              <FileText className="h-10 w-10 text-white/30" />
              <p className="text-sm">Preview unavailable for this file type.</p>
              <Button onClick={() => onDownload(doc)} className="bg-amber-400 hover:bg-amber-300 text-slate-900">
                <Download className="h-4 w-4 mr-2" /> Download to view
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onPrint(doc)}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button variant="ghost" onClick={() => onDownload(doc)}>
            <Download className="h-4 w-4 mr-2" /> Download
          </Button>
          <Button onClick={onClose} className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminDocuments;
