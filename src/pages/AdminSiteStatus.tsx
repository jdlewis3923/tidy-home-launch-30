/**
 * /admin/site-status — master switch plus one switch per public page.
 * A page set ON stays reachable while the master is OFF. Admin and sign-in
 * pages are always reachable and are not listed here.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { useSiteLive } from "@/hooks/useSiteLive";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import ServiceGateCards from "@/components/admin/hiring/ServiceGateCards";
import { TOGGLEABLE_PAGES, FOUNDING_DEPENDENCIES } from "@/lib/pageVisibility";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Row = { path: string; is_on: boolean; updated_at: string; updated_by_email: string | null };

const AdminSiteStatus = () => {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const { isLive, isLoading, refresh } = useSiteLive();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [confirmFoundingOff, setConfirmFoundingOff] = useState(false);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user)); }, []);

  const pages = useQuery({
    queryKey: ["admin-page-visibility"],
    enabled: !!hasRole,
    queryFn: async () => {
      const { data, error } = await supabase.from("page_visibility").select("path, is_on, updated_at, updated_by_email");
      if (error) throw error;
      return Object.fromEntries((data as Row[]).map((r) => [r.path, r])) as Record<string, Row>;
    },
  });

  const onMaster = async (next: boolean) => {
    setSaving("master");
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert({ key: "site_live", value: next, updated_by: authData.user?.id ?? null });
    setSaving(null);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); return; }
    toast({ title: next ? "Master switch ON" : "Master switch OFF", description: next ? "Every public page is reachable." : "Only pages switched ON below stay reachable." });
    refresh();
  };

  const setPage = async (path: string, next: boolean) => {
    setSaving(path);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("page_visibility").upsert({
      path, is_on: next, updated_at: new Date().toISOString(), updated_by: authData.user?.id ?? null, updated_by_email: authData.user?.email ?? null,
    });
    setSaving(null);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${path} is now ${next ? "ON" : "OFF"}` });
    qc.invalidateQueries({ queryKey: ["admin-page-visibility"] });
    qc.invalidateQueries({ queryKey: ["page-visibility"] });
  };

  if (authed === false) {
    return <div className="min-h-screen flex items-center justify-center px-6 text-center"><div><h1 className="text-xl font-semibold mb-2">Sign in required</h1><Link to="/login" className="text-primary underline">Go to login</Link></div></div>;
  }
  if (roleLoading || authed === null) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!hasRole) return <div className="min-h-screen flex items-center justify-center px-6 text-center"><div><h1 className="text-xl font-semibold mb-2">Forbidden</h1><p className="text-muted-foreground">This area is restricted to admins.</p></div></div>;

  const rows = pages.data ?? {};
  // A page is reachable when the master is on, or its own switch is on (/founding: unless switched off).
  const reachable = (p: string) => (p === "/founding" ? rows[p]?.is_on !== false : isLive || !!rows[p]?.is_on);
  const brokenLinks = reachable("/founding") ? FOUNDING_DEPENDENCIES.filter((d) => !reachable(d)) : [];

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <Link to="/admin/health" className="text-sm text-muted-foreground hover:text-foreground">← Admin</Link>
        <h1 className="mt-4 text-3xl font-semibold">Site status</h1>
        <p className="mt-2 text-muted-foreground">Turn single pages on or off without flipping the whole site. A page switched ON stays reachable even when the master switch is OFF. Admin and sign-in pages are always reachable.</p>

        {brokenLinks.length > 0 && (
          <div role="alert" className="mt-6 rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-sm">
            <b>Dead link warning:</b> /founding is ON and links to {brokenLinks.join(", ")}, which {brokenLinks.length > 1 ? "are" : "is"} OFF. Door-hanger visitors will hit the Coming Soon page from those links. Turn {brokenLinks.length > 1 ? "them" : "it"} on below.
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-card border border-border shadow-sm p-6 flex items-center justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Master switch</div>
            <div className="mt-1 text-2xl font-semibold">{isLoading ? "…" : isLive ? "Live" : "Off"}</div>
            <div className="mt-1 text-sm text-muted-foreground">{isLive ? "Every public page is reachable." : "Only pages switched ON below are reachable."}</div>
          </div>
          <Switch checked={isLive} disabled={saving === "master" || isLoading} onCheckedChange={(v) => onMaster(!!v)} aria-label="Master site switch" />
        </div>

        <div className="mt-6 rounded-2xl bg-card border border-border shadow-sm divide-y divide-border">
          {TOGGLEABLE_PAGES.map((p) => {
            const r = rows[p.path];
            const isOn = p.path === "/founding" ? r?.is_on !== false : !!r?.is_on;
            return (
              <div key={p.path} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="font-semibold">{p.label} <code className="ml-1 text-xs text-muted-foreground">{p.path}</code></div>
                  <div className="text-xs text-muted-foreground">
                    {reachable(p.path) ? "Reachable" : "Shows Coming Soon"}
                    {!isOn && isLive && p.path !== "/founding" ? " (via master switch)" : ""}
                    {r?.updated_at ? ` · changed ${new Date(r.updated_at).toLocaleString()}${r.updated_by_email ? ` by ${r.updated_by_email}` : ""}` : ""}
                  </div>
                </div>
                <Switch checked={isOn} disabled={saving === p.path || pages.isLoading} aria-label={`Toggle ${p.path}`}
                  onCheckedChange={(v) => (p.path === "/founding" && !v ? setConfirmFoundingOff(true) : setPage(p.path, !!v))} />
              </div>
            );
          })}
        </div>

        <ServiceGateCards />

        <p className="mt-6 text-sm text-muted-foreground">Always reachable: <code>/admin/*</code>, <code>/login</code>, <code>/forgot-password</code>, <code>/reset-password</code>. Preview the visitor view: <Link to="/coming-soon" className="text-primary underline">/coming-soon</Link></p>
      </div>

      <AlertDialog open={confirmFoundingOff} onOpenChange={setConfirmFoundingOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off /founding?</AlertDialogTitle>
            <AlertDialogDescription>Door hangers in market point at this page. Every QR scan will land on the Coming Soon page instead of the price quote.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction onClick={() => setPage("/founding", false)}>Turn off anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSiteStatus;
