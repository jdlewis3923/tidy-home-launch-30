export type PackItem = 'intake' | 'agreement' | 'app' | 'insurance' | 'background';
export type PackLinks = { intake: string; agreement: string | null; app: string | null; insurance: string; background: string };
export function onboardingPack(links: PackLinks, es: boolean, item?: PackItem): string {
  const rows: Record<PackItem, string> = {
    intake: `${es ? 'Formulario Pro' : 'Pro Intake'}: ${links.intake}`,
    agreement: links.agreement ? `${es ? 'Acuerdo de contratista' : 'Contractor agreement'}: ${links.agreement}` : es ? 'El enlace de su acuerdo viene después.' : 'Your agreement link comes next.',
    app: links.app ? `${es ? 'Aplicación Pro' : 'Pro app login'}: ${links.app}` : '',
    insurance: `${es ? 'Guía de seguro' : 'Insurance guide'}: ${links.insurance}`,
    background: es ? 'Revise su correo para una invitación de Checkr para la verificación de antecedentes. Tidy la paga.' : 'Watch your email for a background check invite from Checkr. Tidy pays for it.',
  };
  return item ? rows[item] : [rows.intake, rows.agreement, rows.app, rows.insurance, rows.background].filter(Boolean).join('\n\n');
}