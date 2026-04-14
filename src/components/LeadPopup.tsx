import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import TidyLogo from "./TidyLogo";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";

const WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/26380119/un5oqdu/";

interface LeadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const LeadPopup = ({ isOpen, onClose, onSuccess }: LeadPopupProps) => {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", zip: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required";
    if (!form.email.trim() || !form.email.includes("@")) errs.email = "Valid email is required";
    if (!form.phone.trim()) errs.phone = "Phone number is required";
    if (!form.smsConsent) errs.smsConsent = "SMS consent is required";
    if (!form.zip.trim()) errs.zip = "ZIP code is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "no-cors",
        body: JSON.stringify({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          phone: form.phone,
          zip: form.zip,
          sms_consent: form.smsConsent,
          source: "website_popup",
          timestamp: new Date().toISOString(),
        }),
      });
      // Fire lead submission + conversion event
      pushEvent("lead_form_submit", {
        source: "website_popup",
        email: form.email,
        zip: form.zip,
      });
      pushEvent("conversion", {
        send_to: "AW-CONVERSION_ID/CONVERSION_LABEL",
        event_category: "lead",
        event_label: "early_access_signup",
      });
    } catch (err) {
      console.error("Webhook error:", err);
    }

    setIsSubmitting(false);
    localStorage.setItem("tidy_popup_dismissed", Date.now().toString());
    onSuccess();
  };

  const handleClose = () => {
    localStorage.setItem("tidy_popup_dismissed", Date.now().toString());
    onClose();
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="relative rounded-3xl shadow-[0_25px_80px_-15px_rgba(0,0,0,0.7)] max-w-[520px] w-full max-h-[90vh] overflow-y-auto animate-bounce-in">
        <button onClick={handleClose} className="absolute top-5 right-5 z-10 text-white/60 hover:text-white transition-colors p-1">
          <X className="w-5 h-5" />
        </button>

        <div className="bg-gradient-to-r from-[#0f172a] to-[#1e3a5f] rounded-t-3xl px-8 pt-10 pb-8 text-center">
          <div className="flex justify-center mb-5">
            <TidyLogo size="lg" withBackground />
          </div>
          <span className="inline-block bg-yellow-400 text-gray-900 text-xs font-bold px-5 py-2 rounded-full mb-4 tracking-wide uppercase">
            {t("🎉 Founding Member Offer")}
          </span>
          <h3 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
            {t("Get $50 Off Your")}<br />{t("First Month")}
          </h3>
          <p className="text-slate-300/70 text-sm mt-3 max-w-sm mx-auto leading-relaxed">
            {t("Join Miami homeowners who have already simplified their home. Lock in founding pricing before we launch publicly.")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-3xl px-8 pb-8 pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input className={`w-full bg-gray-100 border ${errors.firstName ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all`} placeholder={t("First Name")} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              {errors.firstName && <p className="text-xs text-red-500 mt-1 font-medium">{errors.firstName}</p>}
            </div>
            <div>
              <input className={`w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all`} placeholder={t("Last Name")} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <input className={`w-full bg-gray-100 border ${errors.email ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all`} placeholder={t("Email Address")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>}
          </div>
          <div>
            <input className={`w-full bg-gray-100 border ${errors.phone ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all`} placeholder={t("Phone Number")} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {errors.phone && <p className="text-xs text-red-500 mt-1 font-medium">{errors.phone}</p>}
          </div>
          <div>
            <input className={`w-full bg-gray-100 border ${errors.zip ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all`} placeholder={t("ZIP Code")} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            {errors.zip && <p className="text-xs text-red-500 mt-1 font-medium">{errors.zip}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-xl transition-all text-base disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            {isSubmitting ? t("Submitting...") : t("Claim My Founding Spot →")}
          </button>

          <p className="text-[11px] text-gray-400 leading-relaxed text-center">
            {t("By submitting, you agree to receive email communications from Tidy Home Concierge LLC regarding your account and services. By checking the SMS consent box above, you also agree to receive recurring automated transactional and informational text messages at the phone number provided, including account notifications, appointment reminders, service updates, and customer care communications. Message frequency varies. Msg & data rates may apply. Consent to SMS is not a condition of any purchase. Reply STOP to cancel or HELP for assistance. Carriers are not liable for delayed or undelivered messages.")}{" "}
            <a href="/privacy" className="text-blue-500 underline">{t("Privacy Policy")}</a> | <a href="/terms" className="text-blue-500 underline">{t("Terms of Service")}</a>.
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-1">
            {["No commitment", "Cancel anytime", "Secure & private"].map((item) => (
              <span key={item} className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                {t(item)}
              </span>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadPopup;
