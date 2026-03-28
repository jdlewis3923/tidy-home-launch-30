import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import TidyLogo from "./TidyLogo";

const WEBHOOK_URL = "YOUR_ZAPIER_WEBHOOK_URL_HERE";

interface LeadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const LeadPopup = ({ isOpen, onClose, onSuccess }: LeadPopupProps) => {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", zip: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required";
    if (!form.email.trim() || !form.email.includes("@")) errs.email = "Valid email is required";
    if (!form.phone.trim()) errs.phone = "Phone number is required";
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
          source: "website_popup",
          timestamp: new Date().toISOString(),
        }),
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

  const inputClass = (field: string) =>
    `w-full bg-white border-2 ${errors[field] ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div className="relative bg-white rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] max-w-[520px] w-full max-h-[90vh] overflow-y-auto animate-bounce-in">
        <button onClick={handleClose} className="absolute top-5 right-5 z-10 text-white/70 hover:text-white transition-colors p-1">
          <X className="w-5 h-5" />
        </button>

        {/* Header — dark with high contrast */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a] px-8 pt-10 pb-8 text-center rounded-t-3xl relative overflow-hidden">
          {/* Subtle radial glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.2),_transparent_60%)]" />
          <div className="relative z-10">
            <div className="flex justify-center mb-5">
              <TidyLogo size="lg" withBackground />
            </div>
            <span className="inline-block bg-yellow-400/20 text-yellow-300 text-xs font-bold px-5 py-2 rounded-full mb-4 tracking-wide uppercase">
              🎉 Founding Member Offer
            </span>
            <h3 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
              Get $50 Off Your<br />First Month
            </h3>
            <p className="text-blue-200/70 text-sm mt-3 max-w-sm mx-auto leading-relaxed">
              Join Miami homeowners who have already simplified their home. Lock in founding pricing before we launch publicly.
            </p>
          </div>
        </div>

        {/* Form — clean white with clear field styling */}
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input className={inputClass("firstName")} placeholder="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              {errors.firstName && <p className="text-xs text-red-500 mt-1 font-medium">{errors.firstName}</p>}
            </div>
            <div>
              <input className={inputClass("lastName")} placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <input className={inputClass("email")} placeholder="Email Address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>}
          </div>
          <div>
            <input className={inputClass("phone")} placeholder="Phone Number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {errors.phone && <p className="text-xs text-red-500 mt-1 font-medium">{errors.phone}</p>}
          </div>
          <div>
            <input className={inputClass("zip")} placeholder="ZIP Code" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            {errors.zip && <p className="text-xs text-red-500 mt-1 font-medium">{errors.zip}</p>}
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            By submitting, you agree to receive SMS and email communications from Tidy Home Concierge LLC regarding your account, services, and promotions. Reply STOP to opt out anytime. Message & data rates may apply. View our{" "}
            <a href="/privacy" className="text-blue-500 underline">Privacy Policy</a>.
          </p>

          {/* Glowing CTA button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full relative bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900 font-extrabold py-4.5 rounded-xl transition-all text-base disabled:opacity-50 shadow-[0_0_20px_rgba(245,197,24,0.4)] hover:shadow-[0_0_30px_rgba(245,197,24,0.6)] hover:scale-[1.02] active:scale-[0.98]"
          >
            {isSubmitting ? "Submitting..." : "Claim My $50 Founding Discount →"}
          </button>

          <div className="flex flex-wrap justify-center gap-4 pt-2">
            {["No commitment", "Cancel anytime", "Secure & private"].map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadPopup;
