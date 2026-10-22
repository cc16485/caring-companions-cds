// Every text and email the consumer enrollment packet can send (2026-10-22).
// Wording follows the preview Samantha approved; nothing is sent for real until
// the enroll_messages / enroll_alerts switches are turned on. No em dashes.

const OFFICE = '(417) 218-2888';
const SIGN_OFF = 'Caring Companions CDS\n' + OFFICE + ' (toll free (866) 863-5151)';

export const ENROLL_TEMPLATES = {
  link: { audience: 'family',
    sms: 'Hi {first}, this is Caring Companions. Your CDS enrollment forms are ready to sign on your phone. It takes about 15 minutes: {link} Questions? Call ' + OFFICE + '.',
    email_subject: 'Your CDS enrollment forms are ready',
    email: 'Hi {first},\n\nYour CDS enrollment forms are ready to sign on your phone or computer. It takes about 15 minutes, and it saves as you go:\n\n{link}\n\nWhat is in it:\n- Choosing Caring Companions as your CDS vendor\n- How your attendant clocks in and out\n- Your back-up plan\n- Your tax forms, so we can run payroll and pay your attendant every Thursday\n\nHave these handy: your Social Security number, and the name and phone number of someone who can help if your attendant cannot come.\n\nThe link works only for you, so please do not share it.\n\n' + SIGN_OFF },
  reminder: { audience: 'family',
    sms: 'Hi {first}, it\'s Caring Companions. Your CDS enrollment forms are waiting for you, right where you left off: {link} Questions? Call ' + OFFICE + '.' },
  office_signed: { audience: 'office',
    sms: '{name} signed the CDS enrollment packet. Open their lead, press Sign as agent, then send the tax forms: https://hub.caringcds.com/#leads',
    email_subject: '{name} signed the CDS enrollment packet',
    email: '{name} signed every form in the CDS enrollment packet{rep}.\n\nNext:\n1. Open their lead in the CDS hub (Leads) and press "Sign as agent".\n2. {next}\n\nhttps://hub.caringcds.com/#leads\n\n' + SIGN_OFF },
};

export function fill(t, vars) {
  return String(t || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));
}
