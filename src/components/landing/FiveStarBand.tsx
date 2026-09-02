/**
 * Five-star proof band for /neighbor.
 *
 * Always data-driven: the count comes from the `reviews` table through the
 * `public_five_star_proof` RPC. Under five reviews it renders nothing at all —
 * "2 five-star reviews" is worse than silence. No number is ever hardcoded.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const MIN_VISIBLE = 5;

type Proof = {
  count: number;
  quote: { comment: string | null; name: string | null } | null;
};

interface FiveStarBandProps {
  /** Printed ZIP of the visitor, when the door hanger carried one. */
  neighborhoods: string;
}

const FiveStarBand = ({ neighborhoods }: FiveStarBandProps) => {
  const { t } = useLanguage();
  const [proof, setProof] = useState<Proof | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>
      )("public_five_star_proof");
      if (cancelled || error || !data) return;
      setProof(data as Proof);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!proof || Number(proof.count) < MIN_VISIBLE) return null;

  const quote = proof.quote?.comment?.trim();
  const name = proof.quote?.name?.trim();

  return (
    <div className="mt-4">
      <p className="text-[15px] font-medium leading-snug text-white/90">
        <span aria-hidden="true" className="mr-2 tracking-[0.12em] text-[#F7C618]">
          ★★★★★
        </span>
        <span className="font-bold">
          {proof.count} {t("five-star reviews")}
        </span>{" "}
        {t("from neighbors in")} {neighborhoods}
      </p>
      {quote && (
        <p className="mt-2 text-[15px] font-normal italic leading-snug text-white/75">
          “{quote}”{name ? <span className="not-italic font-bold"> — {name}</span> : null}
        </p>
      )}
    </div>
  );
};

export default FiveStarBand;
