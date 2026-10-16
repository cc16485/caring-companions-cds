// CDS Caregiver Match: every message the system can create.
// Wording here needs Samantha's approval before any message is sent for real.
// No em dashes (her rule). Placeholders are filled by fill().

export const FCSR_HOWTO_URL = 'health.mo.gov/providers/family-care-safety-registry/how-register-family-care-safety-registry';
export const FCSR_REGISTER_URL = 'healthapps.dhss.mo.gov/BSEES/Main.aspx';
export const FCSR_PHONE = '866-422-6872';
export const OFFICE_PHONE = '417-218-2888';
export const OFFICE_TOLL_FREE = '866-863-5151';
const SIGN_OFF = 'Caring Companions CDS\n' + OFFICE_PHONE + ' (toll free ' + OFFICE_TOLL_FREE + ')';

// Employer the FCSR screening runs under (Samantha, 2026-10-15: "right now").
export const FCSR_EMPLOYER = 'Troutman Enterprises, LLC (DBA Caring Companions In-Home Senior Care)';
// Registration type: the same one Caring Companions applicants use under this
// employer (approved for CC 2026-10-14; set for CDS 2026-10-15).
export const FCSR_REG_TYPE = 'Personal Care, In-Home Services';

export const TEMPLATES = {
  cg_fcsr_steps: {
    audience: 'caregiver', label: 'FCSR requirement and registration steps',
    sms: 'Hi {first}, it\'s Caring Companions CDS. To provide CDS services in Missouri you must meet the state\'s screening requirements, including the Family Care Safety Registry (FCSR). We complete the screening. Already registered? You don\'t pay again, just tell us. If you aren\'t registered yet, register yourself at ' + FCSR_REGISTER_URL + ' (Registration, then Register Online). Employer: ' + FCSR_EMPLOYER + '. Type: ' + FCSR_REG_TYPE + '. One-time fee: $16, or $16.57 online. Full instructions: ' + FCSR_HOWTO_URL + ' When you\'re done, tap here to let us know: {link}',
    email_subject: 'Your next step: Missouri FCSR registration',
    email: 'Hi {first},\n\nTo become eligible to provide services through Missouri\'s Consumer Directed Services (CDS) program, you must meet the state\'s caregiver screening requirements, including the Family Care Safety Registry (FCSR).\n\nCaring Companions CDS will complete the required FCSR screening. If you are not already registered with the Missouri FCSR, you will need to register yourself. The registration fee is $16, or $16.57 if you register online, which includes the state\'s processing fee. You only register once, so if you are already registered, there is nothing to pay again.\n\nHow to register:\n1. Go to ' + FCSR_REGISTER_URL + ' and choose Registration, then Register Online.\n2. Have your Social Security number, your own email address, and a debit or credit card ready.\n3. For employer, choose ' + FCSR_EMPLOYER + '. For registration type, choose ' + FCSR_REG_TYPE + '.\n4. Pay the one-time fee.\n5. When you\'re done, let us know here: {link}\n\nOfficial instructions: ' + FCSR_HOWTO_URL + '\nQuestions about the state\'s site: FCSR, ' + FCSR_PHONE + ', weekdays 9 to 3.\n\nOnce you are registered, please let us know so we can continue the screening process.\n\n' + SIGN_OFF,
  },
  // To the office only (setting office_alerts). Approved by Samantha 2026-10-16.
  office_cg_signup: {
    audience: 'office', label: 'New caregiver sign-up (office alert)',
    email_subject: '{flag}{headline}: {name_short}',
    email: '{name} {did} the CDS caregiver list.\n\nPhone: {phone}\nEmail: {email}\nTown: {town}\nCounties: {counties}\nLooking for: {hours}\nExperience: {experience}\nHas someone to care for: {has}\nAlready registered with FCSR: {fcsr}\n\nNext step: call to say hello within 1 business day, then send the profile link.\nOpen the CDS Hub: https://hub.caringcds.com (Attendants, then Caregiver Match)\n\n' + SIGN_OFF,
  },
  cg_profile_link: {
    audience: 'caregiver', label: 'Caregiver profile link',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Thanks for joining our caregiver list! Here\'s your private link to finish your profile and state requirements: {link} It works only for you, so please don\'t share it.',
    email_subject: 'Your private link to finish your caregiver profile',
    email: 'Hi {first},\n\nThanks for joining our caregiver list. Here is your private link to finish your profile, add a photo and an optional intro video, and complete the state requirements:\n\n{link}\n\nThe link works only for you, so please don\'t share it. You can come back to it any time to update your days and times.\n\n' + SIGN_OFF,
  },
  cg_intro_request: {
    audience: 'caregiver', label: 'A family would like to meet you',
    sms: 'Hi {first}, it\'s Caring Companions CDS. A family near {town} would like to meet you ({how}). Tap to see what they need and answer yes or no: {link}',
    email_subject: 'A family would like to meet you',
    email: 'Hi {first},\n\nA family near {town} would like to meet you ({how}). Tap below to see what they need and answer yes or no:\n\n{link}\n\nMeeting doesn\'t commit you to anything.\n\n' + SIGN_OFF,
  },
  fam_invite: {
    audience: 'family', label: 'Private directory invitation',
    sms: 'Hi {first}, it\'s {staff} at Caring Companions CDS. Here is your personal invitation to our private caregiver directory: {link} It\'s free to look, and you don\'t have to choose us or switch programs to browse.',
    email_subject: 'Your invitation to our private caregiver directory',
    email: 'Hi {first},\n\nAs we talked about, here is your personal invitation to the Caring Companions CDS private caregiver directory:\n\n{link}\n\nWhen you open it, we\'ll send a code to this email or your phone to confirm it\'s you. The invitation is just for you, so please don\'t forward it. If someone else in your family would like their own, call us.\n\nIt\'s free to look, and you don\'t have to choose us or switch programs to browse. You can choose any CDS provider.\n\n{staff}\n' + SIGN_OFF,
  },
  fam_code: {
    audience: 'family', label: 'Sign-in code (sent only when the family asks)',
    sms: 'Your Caring Companions CDS sign-in code is {code}. It expires in 10 minutes. If you didn\'t ask for it, you can ignore this.',
    email_subject: 'Your sign-in code: {code}',
    email: 'Your Caring Companions CDS sign-in code is {code}.\n\nIt expires in 10 minutes. If you didn\'t ask for it, you can ignore this email.',
  },
  meet_family: {
    audience: 'family', label: 'Meet-and-greet details (family)',
    sms: 'Hi {first}, it\'s Caring Companions CDS. You\'re set to meet {cg} on {when} ({how}). {details} Questions? ' + OFFICE_PHONE,
    email_subject: 'Your meet-and-greet with {cg}',
    email: 'Hi {first},\n\nYou\'re set to meet {cg} on {when}.\nHow: {how}\n{details}\n\nMeeting doesn\'t commit you or {cg} to anything. You decide who to hire.\n\n' + SIGN_OFF,
  },
  meet_caregiver: {
    audience: 'caregiver', label: 'Meet-and-greet details (caregiver)',
    sms: 'Hi {first}, it\'s Caring Companions CDS. You\'re set to meet {family} on {when} ({how}). {details} Questions? ' + OFFICE_PHONE,
    email_subject: 'Your meet-and-greet with {family}',
    email: 'Hi {first},\n\nYou\'re set to meet {family} on {when}.\nHow: {how}\n{details}\n\n' + SIGN_OFF,
  },
};

export function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null) ? m : String(vars[k]));
}

// The caregiver-facing explanation on the requirements screen (her wording).
export const FCSR_EXPLAINER = [
  'To become eligible to provide services through Missouri\'s Consumer Directed Services (CDS) program, you must meet the state\'s caregiver screening requirements, including the Family Care Safety Registry (FCSR).',
  'Caring Companions CDS will complete the required FCSR screening. If you are not already registered with the Missouri FCSR, you will need to register yourself. The registration fee is $16, or $16.57 if you register online, which includes the state\'s processing fee. You only register once, so if you are already registered, there is nothing to pay again.',
  'We will provide you with instructions to complete registration. Once you are registered, please let us know so we can continue the screening process.',
];

export const CONSENT_WORDING = {
  profile: { version: 'profile-2026-10-15', text: 'I agree that Caring Companions CDS may show my first name, photo, town, the areas I work in, my availability, and the profile I wrote to families invited to its private caregiver directory, so they can ask to meet me. My last name, phone, email, address and screening details are never shown. I can change or remove my listing at any time.' },
  video: { version: 'video-2026-10-15', text: 'I agree that Caring Companions CDS may show my intro video to families invited to its private caregiver directory. I can replace or remove it at any time, and it will be taken down when I ask.' },
};

export const PROVIDER_CHOICE = 'You can choose any CDS provider. Changes to your services go through the Division of Senior and Disability Services (1-866-835-3505). Your current services continue until new services are authorized.';
