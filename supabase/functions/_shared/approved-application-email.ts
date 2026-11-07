import { buildPaperworkEmail } from './paperwork-email.ts';

export const APPROVED_APPLICANT = 'c1f3609c-61f3-4d6a-a280-e7f354e191a9';
export const APPROVED_EMAIL = 'alekljustina@gmail.com';
export const APPROVED_APPLICATION_LINK = 'https://app.connecteam.com/#/apply?link=7fd96f05-4ce2-4179-b162-be193866b2af';
export function approvedApplicationRecipient(id: string, email: string) {
  return id === APPROVED_APPLICANT && email.trim().toLowerCase() === APPROVED_EMAIL;
}
export function approvedApplicationEmail() {
  const subject = 'Next step: complete your Tidy Lawn Care Pro application';
  const text = `Hi Aleksandar, this is Tidy Home Concierge. To continue with your Lawn Care Pro application, please complete your profile here (about 3 minutes), including photos of your equipment: ${APPROVED_APPLICATION_LINK} Once it's submitted, you'll move to the next step automatically. Questions? Call (786) 829-1141.`;
  const base = buildPaperworkEmail({ first: 'Aleksandar', phone: '', service: 'lawn', status: {}, signed: false, coiValid: false, lang: 'en' }, 'welcome');
  const content = `<p style="font-size:16px;line-height:1.65">${text}</p><p style="margin:24px 0"><a href="${APPROVED_APPLICATION_LINK}" style="display:block;text-align:center;background:#f5c518;color:#0f172a;padding:18px 20px;text-decoration:none;font-weight:700;border-radius:6px">Complete my application</a></p>`;
  return { subject, text, html: base.html.replace(/<h1 style="font-size:26px">[\s\S]*?(?=<\/td>)/, content) };
}