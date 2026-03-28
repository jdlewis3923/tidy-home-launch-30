import TidyLogo from "@/components/TidyLogo";
import { Link } from "react-router-dom";

const ThankYou = () => (
  <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
    <div className="max-w-[540px] w-full text-center">
      <div className="animate-float inline-block mb-6">
        <TidyLogo size="lg" />
      </div>

      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">You're officially in!</h1>
      <p className="text-primary font-semibold text-lg mb-6">Your $50 founding discount is locked.</p>
      <p className="text-text-mid mb-8">
        We're prioritizing homes for the initial rollout — and you're at the front of the line.
      </p>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-8 text-left mb-8">
        <h3 className="font-bold text-foreground mb-4">Here's what happens next:</h3>
        <ul className="space-y-4 text-sm text-text-mid">
          <li className="flex items-start gap-3">
            <span className="text-lg">📬</span>
            <span><strong>Check your email</strong> — your confirmation just landed with your $50 credit details and next steps.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-lg">📱</span>
            <span><strong>Watch for a text from Tidy</strong> within 24 hours to confirm your spot and check your ZIP code availability.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-lg">🗓️</span>
            <span><strong>Once we launch in your area</strong>, you'll be among the first activated — with priority scheduling and locked pricing.</span>
          </li>
        </ul>
      </div>

      <p className="text-sm text-text-light mb-8">
        Questions? Email us at <a href="mailto:hello@jointidy.co" className="text-primary underline">hello@jointidy.co</a>
      </p>

      <Link to="/" className="text-sm text-primary hover:text-primary-deep font-medium transition-colors">
        ← Back to the site
      </Link>
    </div>
  </div>
);

export default ThankYou;
