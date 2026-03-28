import { useState, useEffect, useCallback } from "react";
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
    `w-full bg-background border ${errors[field] ? "border-destructive" : "border-border"} rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" />

      <div className="relative bg-card rounded-2xl shadow-2xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto animate-bounce-in">
        <button onClick={handleClose} className="absolute top-4 right-4 z-10 text-foreground/50 hover:text-foreground p-1">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-navy to-primary-deep px-8 py-8 text-center rounded-t-2xl">
          <div className="flex justify-center mb-4"><TidyLogo size="md" /></div>
          <span className="inline-block bg-gold/20 text-gold text-xs font-semibold px-4 py-1.5 rounded-full mb-3">
            🎉 Founding Member Offer
          </span>
          <h3 className="text-2xl font-bold text-primary-foreground">Get $50 Off Your First Month</h3>
          <p className="text-primary-foreground/60 text-sm mt-2">
            Join Miami homeowners who have already simplified their home. Lock in founding pricing before we launch publicly.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input className={inputClass("firstName")} placeholder="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              {errors.firstName && <p className="text-xs text-destructive mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <input className={inputClass("lastName")} placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <input className={inputClass("email")} placeholder="Email Address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>
          <div>
            <input className={inputClass("phone")} placeholder="Phone Number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          </div>
          <div>
            <input className={inputClass("zip")} placeholder="ZIP Code" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            {errors.zip && <p className="text-xs text-destructive mt-1">{errors.zip}</p>}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            By submitting, you agree to receive SMS and email communications from Tidy Home Concierge LLC regarding your account, services, and promotions. Reply STOP to opt out anytime. Message & data rates may apply. View our{" "}
            <a href="/privacy" className="text-primary underline">Privacy Policy</a>.
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-primary to-primary-deep hover:opacity-90 text-primary-foreground font-bold py-4 rounded-xl transition-opacity text-base disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Claim My $50 Founding Discount →"}
          </button>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {["No commitment", "Cancel anytime", "Secure & private"].map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="w-3 h-3 text-success" />
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
