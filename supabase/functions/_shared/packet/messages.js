// Every text and email the attendant packet can send (2026-10-21). Wording
// follows the preview Samantha reviewed; nothing is sent for real until the
// packet_messages / packet_alerts switches are turned on. No em dashes.
import { HANDBOOK_URL, ORIENTATION_URL } from './forms.js';

const OFFICE = '(417) 218-2888';
const SIGN_OFF = 'Caring Companions CDS\n' + OFFICE + ' (toll free (866) 863-5151)';
// The state's Good Cause Waiver page and forms, checked 2026-10-23 (the page moved from /safety/goodcausewaiver).
export const GCW_PAGE = 'https://health.mo.gov/providers/good-cause-waiver';
export const GCW_FORMS = {
  application: 'https://health.mo.gov/sites/health/files/media/pdf/2026/08/Application%20for%20Good%20Cause%20Waiver.pdf',
  explanation: 'https://health.mo.gov/sites/health/files/media/pdf/2026/08/Explanation%20of%20Background%20Screening%20Findings%20Form.pdf',
  history: 'https://health.mo.gov/sites/health/files/media/pdf/2026/08/Employment%20History.pdf',
};
// MMAC's list of FCSR findings that bar CDS hiring without a waiver.
export const CANNOT_HIRE_LIST = 'https://mmac.mo.gov/wp-content/uploads/Disqaulifying-Factors-FCSR-2023.pdf';
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
  // The 5-minute ID check video room (2026-10-27). {room} = the GoHighLevel Meeting Room link from
  // setting id_room; without one the message waits in Messages instead of going out with no link.
  att_id_booked: { audience: 'caregiver', switch: 'id_room', room: true,
    sms: 'Hi {first}, your 5-minute ID check with Caring Companions CDS is booked for {time} (Central). At that time, open this link and wait to be let in: {room} Have the same original ID documents you uploaded to Empeon with you. Need a different time? Call ' + OFFICE + '.',
    email_subject: 'Your 5-minute ID check: {time}',
    email: 'Hi {first},\n\nYour 5-minute ID check is booked for {time} (Central time).\n\nAt that time, open this link on your phone or computer and wait to be let in:\n\n{room}\n\nPlease have the same original ID documents you uploaded to Empeon with you, so you can hold them up to the camera. Copies or photos of them will not work.\n\nNeed a different time? Call ' + OFFICE + '.\n\n' + SIGN_OFF },
  att_id_soon: { audience: 'caregiver', switch: 'id_room', room: true,
    sms: 'Hi {first}, your 5-minute ID check is at {clock} today. Open this link then and wait to be let in: {room} Have your original ID documents with you.' },
  // FCSR came back with something (2026-10-23, wording she approved on the mockup). The text never
  // says what came up; the email names the check and the next step, never the details.
  att_fcsr_gcw: { audience: 'caregiver', switch: 'fcsr_notices',
    sms: 'Hi {first}, this is Caring Companions. Your CDS background screening came back and there is one more step before you can start working for {consumer}. We sent the details to your email. Questions? Call us at 417-218-2888.',
    email_subject: 'Your CDS background screening: one more step',
    email: 'Hi {first},\n\nYour Family Care Safety Registry (FCSR) screening came back with a finding. Under Missouri law (Section 192.2495 RSMo), a person with this kind of finding needs a Good Cause Waiver from the Missouri Department of Health and Senior Services before they can work as a CDS attendant.\n\n'
      + 'Until the waiver is approved, we can\'t approve you to work for {consumer}, and CDS hours can\'t be paid. Please don\'t start working shifts yet.\n\n'
      + 'How to apply (you send this to the state yourself):\n\n'
      + '1. Fill out and sign the Good Cause Waiver application: ' + GCW_FORMS.application + '\n'
      + '2. Fill out an Explanation form for each event: what happened, when and where, and why you believe the waiver should be approved: ' + GCW_FORMS.explanation + '\n'
      + '3. Fill out the Employment History form (every job since age 18): ' + GCW_FORMS.history + '\n'
      + '4. Add one letter from a past or current employer, or three letters from people who know you well (not family, not anyone you live with).\n'
      + '5. Send it all to: Good Cause Waiver Program, Missouri DHSS, PO Box 570, Jefferson City, MO 65102-0570, or fax 573-522-6981.\n\n'
      + 'The state only reviews complete applications. Questions about the waiver: 1-866-422-6872 (9am to 3pm, Monday to Friday) or fcsr@health.mo.gov. More on the DHSS Good Cause Waiver page: ' + GCW_PAGE + '\n\n'
      + 'The state mails you a letter with their decision. When it comes, send us a photo of it by text or email and we will take it from there.\n\n'
      + 'Caring Companions In-Home Senior Care\n417-218-2888' },
  att_fcsr_edl: { audience: 'caregiver', switch: 'fcsr_notices',
    sms: 'Hi {first}, this is Caring Companions. Your CDS background screening came back. We sent the details to your email. Questions? Call us at 417-218-2888.',
    email_subject: 'Your CDS background screening',
    email: 'Hi {first},\n\nYour background screening shows your name on the Missouri DHSS Employee Disqualification List (EDL). Missouri law does not allow anyone on this list to work as a CDS attendant, and a Good Cause Waiver is not available for it. Because of this, we are not able to approve you to work for {consumer} in the CDS program.\n\n'
      + 'If you believe this is a mistake, please call DHSS at 1-866-422-6872.\n\nCaring Companions In-Home Senior Care\n417-218-2888' },
  att_gcw_reminder: { audience: 'caregiver', switch: 'fcsr_notices',
    sms: 'Hi {first}, this is Caring Companions checking in on your Good Cause Waiver. Once the state sends your approval letter, text us a photo of it here. Questions? 417-218-2888.' },
  office_step1: { audience: 'office',
    sms: '{urgent}{name} signed CDS Step 1{for}. {oig} Run EDL and FCSR: https://hub.caringcds.com/#activeattendants',
    email_subject: '{urgent}Step 1 signed: run EDL and FCSR for {name}',
    email: '{name} signed the CDS attendant application{for}.\n\n{oig}\nRun EDL and FCSR: open their profile in the CDS hub (Attendants, then Active Attendants), where every field the forms need has a Copy button.\nhttps://hub.caringcds.com/#activeattendants\n\nFCSR registration: {fcsr}\nCaregiver list: {list}\n\n' + SIGN_OFF },
};

export function fill(t, vars) {
  return String(t || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));
}
