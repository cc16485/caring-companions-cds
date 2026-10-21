// Every text and email the attendant packet can send (2026-10-21). Wording
// follows the preview Samantha reviewed; nothing is sent for real until the
// packet_messages / packet_alerts switches are turned on. No em dashes.
import { HANDBOOK_URL, ORIENTATION_URL } from './forms.js';

const OFFICE = '(417) 218-2888';
const SIGN_OFF = 'Caring Companions CDS\n' + OFFICE + ' (toll free (866) 863-5151)';
const short = u => u.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '');

export const PACKET_TEMPLATES = {
  // A repeat phone on the public link never sees a link on screen: it goes to the phone on file.
  att_link: { audience: 'caregiver',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Here is your private link to your attendant application: {link} It works only for you, so please don\'t share it. Questions? Call ' + OFFICE + '.',
    email_subject: 'Your Caring Companions CDS application link',
    email: 'Hi {first},\n\nHere is your private link to your attendant application. It saves as you go, so you can stop and come back any time:\n\n{link}\n\nIt works only for you, so please don\'t share it.\n\n' + SIGN_OFF },
  att_step1_reminder: { audience: 'caregiver',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Your attendant application is waiting for you, right where you left off. It takes about 15 minutes: {link}' },
  att_after_step1: { audience: 'caregiver',
    sms: 'Thank you, {first}! While we run your background checks, watch your 1-hour orientation video: ' + short(ORIENTATION_URL) + ' Then read your Attendant Handbook and save this link, so you can come back to it any time you have a question: ' + short(HANDBOOK_URL) + ' Questions? Call ' + OFFICE + '.',
    email_subject: 'While we run your checks: your orientation and handbook',
    email: 'Hi {first},\n\nThank you for your application. While we run your background checks, please:\n\n1. Watch your 1-hour orientation video: ' + ORIENTATION_URL + '\n2. Read your Attendant Handbook: ' + HANDBOOK_URL + '\n\nPlease save the handbook link on your phone. Come back to it any time you have a question while you work as an attendant.\n\nWe will text you as soon as your checks are clear.\n\n' + SIGN_OFF },
  att_orient_reminder: { audience: 'caregiver',
    sms: 'Hi {first}, it\'s Caring Companions CDS. A reminder to watch your 1-hour orientation video while we run your checks: ' + short(ORIENTATION_URL) + ' Your handbook is here: ' + short(HANDBOOK_URL) },
  att_step2_open: { audience: 'caregiver',
    sms: 'Good news, {first}! Your background checks are clear. Open your link to sign your attendant papers and book your 5-minute ID check: {link}',
    email_subject: 'Your checks are clear: next steps',
    email: 'Hi {first},\n\nGood news: your background checks are clear. Open your private link to finish onboarding:\n\n{link}\n\nYou will sign your attendant papers, set up payroll in Empeon, and book a 5-minute video call to show us your ID.\n\nYour Attendant Handbook is always here: ' + HANDBOOK_URL + '\n\n' + SIGN_OFF },
  office_step1: { audience: 'office',
    sms: '{urgent}{name} signed CDS Step 1{for}. {oig} Run EDL and FCSR: https://hub.caringcds.com/#activeattendants',
    email_subject: '{urgent}Step 1 signed: run EDL and FCSR for {name}',
    email: '{name} signed the CDS attendant application{for}.\n\n{oig}\nRun EDL and FCSR: open their profile in the CDS hub (Attendants, then Active Attendants), where every field the forms need has a Copy button.\nhttps://hub.caringcds.com/#activeattendants\n\nFCSR registration: {fcsr}\nCaregiver list: {list}\n\n' + SIGN_OFF },
};

export function fill(t, vars) {
  return String(t || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));
}
