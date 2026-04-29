/**
 * /admin/site-status — master kill switch for the public website.
 *
 * Admin-only. When OFF, every public route renders the branded ComingSoon
 * page. /admin/* and /login remain reachable so admins can flip it back on.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { useSiteLive } from "@/hooks/useSiteLive";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

const AdminSiteStatus = () => {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const { isLive, isLoading, refresh } = useSiteLive();
  const [saving, setSaving] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  const onToggle = async (next: boolean) => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_site_live", { _live: next });
    setSaving(false);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Site is now LIVE" : "Site is now OFF",
      description: next
        ? "Public visitors can access the website again."
        : "Public visitors will see the Coming Soon page.",
    });
    refresh();
  };

  if (authed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Sign in required</h1>
          <Link to="/login" className="text-blue-600 underline">Go to login</Link>
        </div>
      </div>
    );
  }

  if (roleLoading || authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  }

  if (!hasRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Forbidden</h1>
          <p className="text-slate-600">This area is restricted to admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="mx-auto max-w-xl">
        <Link to="/admin/health" className="text-sm text-slate-500 hover:text-slate-700">← Admin</Link>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">Site status</h1>
        <p className="mt-2 text-slate-600">
          Master switch for the entire public website. When off, all visitors see the Coming Soon page. Admin and login routes always remain accessible.
        </p>

        <div className="mt-8 rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Public website</div>
              <div className="mt-1 flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-rose-500"}`} />
                <span className="text-2xl font-semibold text-slate-900">
                  {isLoading ? "…" : isLive ? "Live" : "Off"}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {isLive
                  ? "Visitors see the full website."
                  : "Visitors see the branded Coming Soon page."}
              </div>
            </div>
            <Switch
              checked={isLive}
              disabled={saving || isLoading}
              onCheckedChange={(v) => onToggle(!!v)}
              aria-label="Toggle site live"
            />
          </div>
        </div>

        <div className="mt-6 text-sm text-slate-500 space-y-2">
          <p>
            Preview the visitor view: <Link to="/coming-soon" className="text-blue-600 underline">/coming-soon</Link>
          </p>
          <p>Admin always-open paths: <code className="text-slate-700">/admin/*</code>, <code className="text-slate-700">/login</code>, <code className="text-slate-700">/forgot-password</code>, <code className="text-slate-700">/reset-password</code>.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminSiteStatus;
