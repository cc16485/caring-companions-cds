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
    email: '{name} {did} the CDS caregiver list.\n\nPhone: {phone}\nEmail: {email}\nTown: {town}\nCounties: {counties}\nLooking for: {hours}\nExperience: {experience}\nHas someone to care for: {has}\nAlready registered with FCSR: {fcsr}\n\nNext step: {next}\nOpen the CDS Hub: https://hub.caringcds.com (Attendants, then Caregiver Match)\n\n' + SIGN_OFF,
  },
  cg_profile_link: {
    audience: 'caregiver', label: 'Caregiver profile link',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Thanks for joining our caregiver list! Here\'s your private link to finish your profile and state requirements: {link} It works only for you, so please don\'t share it.',
    email_subject: 'Your private link to finish your caregiver profile',
    email: 'Hi {first},\n\nThanks for joining our caregiver list. Here is your private link to finish your profile, add a photo and an optional intro video, and complete the state requirements:\n\n{link}\n\nThe link works only for you, so please don\'t share it. You can come back to it any time to update your days and times.\n\n' + SIGN_OFF,
  },
  // Finish-your-profile reminders (2026-11-24, wording approved by Samantha 11-24:
  // "Yes, texts are OK"). Sent by the 15-minute job only while setting
  // cg_profile_reminders.live is true. Shorter than the link text.
  cg_profile_nudge1: {
    audience: 'caregiver', label: 'Reminder 1: finish your profile (next day)',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Your caregiver profile is started. Pick up where you left off here: {link} Questions? Call 417-218-2888.',
    email_subject: 'Your caregiver profile is started',
    email: 'Hi {first},\n\nThanks again for joining our caregiver list. Your profile is started, and you can pick up right where you left off:\n\n{link}\n\nStill to do: {todo}.\n\nThe link works only for you, so please don\'t share it. Questions? Just call us.\n\n' + SIGN_OFF,
  },
  cg_profile_nudge2: {
    audience: 'caregiver', label: 'Reminder 2: finish your profile (3 days later)',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Families can\'t see your profile until it\'s finished. A photo and a few words is all it takes: {link}',
    email_subject: 'Families can\'t see your profile yet',
    email: 'Hi {first},\n\nFamilies looking for a caregiver can\'t see your profile until it\'s finished. A photo and a few words about you is most of it:\n\n{link}\n\nStill to do: {todo}.\n\nIf you\'d rather do it over the phone, call us and we\'ll help. If you\'ve changed your mind, that\'s OK too, and we won\'t send more reminders.\n\n' + SIGN_OFF,
  },
  // One-time note (2026-11-26, her wording "Yes, Friday 9 AM"): the photo button opened only the camera
  // on phones (fixed in findcdscaregivers#16). Sent once by the photo_fixed_send job to caregivers with
  // no photo yet. Not a first text, so no opt-out line.
  cg_photo_fixed: {
    audience: 'caregiver', label: 'Photo upload fixed (one-time note)',
    sms: 'Hi {first}, it\'s Caring Companions. Good news: you can now add your profile photo straight from your photo library. Finish your profile here: {link}',
    email_subject: 'You can now add your photo from your photo library',
    email: 'Hi {first},\n\nGood news: you can now add your profile photo straight from your photo library. Finish your profile here:\n\n{link}\n\n' + SIGN_OFF,
  },
  // First text to a past Caring Companions caregiver (the "545" send, 2026-11-25, her wording rounds
  // 11-24/11-25). First text from the CDS line, so it carries the opt-out line (STOP on the first text
  // only). Her PRN rule: say we're reaching out because they worked with us, never "we'd love to have you
  // back". {past} is "worked with", or "applied with" for people never hired.
  cg_former_invite: {
    audience: 'caregiver', label: 'Invitation to past Caring Companions caregivers',
    sms: 'Hi {first}, this is Samantha with Caring Companions. We have a new program, the Consumer Directed Services program (CDS). Add your profile to our CDS caregiver directory, where local families find you and reach out. $15 to $16 an hour, paid weekly: {link}',
    email_subject: '{first}, local families are looking for a caregiver like you',
    email: 'Hi {first},\n\nThis is Samantha with Caring Companions. We have a new program, the Consumer Directed Services program (CDS), and we\'re reaching out because you {past} Caring Companions in the past. We\'ve started a caregiver directory for families in CDS, and we\'d like your profile in it.\n\nHow it works:\n1. You make a short profile: a photo, a few words about you, the days you can work, and if you like, a short video answering a few questions.\n2. Families near you who need care look through the directory and see your profile.\n3. When a family would like to meet you, they call or text you directly to set up an interview (if you choose to share your number), or ask us and we text you. You decide together if it\'s a fit. In CDS, the family hires you.\n\nYour address and last name stay private, and your phone number and email are shown only to signed-in families, only if you say yes.\n\n$15 to $16 an hour, paid weekly every Thursday\nFull time, part time or fill-in shifts\nCaring Companions CDS handles payroll, taxes and the paperwork\n\nSee the directory families use: findcdscaregivers.com\n\nWhen you\'re ready, here is your personal link. It already has your name on it, so getting started takes about a minute:\n\n{link}\n\nQuestions? Call us any weekday, 9am to 4pm.\n\nSamantha\n' + SIGN_OFF + '\n1331 N Stewart Ave, Springfield, MO 65802\n\nYou\'re getting this because you {past} Caring Companions. If you\'d rather not get emails from us, reply and we\'ll take you off the list.',
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
  // Current and starting CDS consumers (2026-11-25). They already have a caregiver,
  // so the directory is for a backup or a new one. Shorter than fam_invite.
  fam_invite_consumer: {
    audience: 'family', label: 'Directory link for a current CDS consumer',
    sms: 'Hi {first}, it\'s Caring Companions CDS. Here is your own link to our caregiver directory, for when you need a backup or new caregiver: {link} It\'s just for you.',
    email_subject: 'Your link to our caregiver directory',
    email: 'Hi {first},\n\nAs a Caring Companions CDS consumer, you have your own link to our private caregiver directory:\n\n{link}\n\nUse it any time you need a backup caregiver or want to find a new one. You can see caregivers near you, watch their short intro videos, and ask to meet them. When you open it, we\'ll send a code to your phone or email to confirm it\'s you.\n\nThe link is just for you, so please don\'t forward it. Questions? Call us.\n\n' + SIGN_OFF,
  },
  // Every quarter to current CDS consumers who have an email (her word 2026-11-25). Email only.
  fam_directory_quarterly: {
    audience: 'family', label: 'Quarterly reminder: your caregiver directory link (email)',
    email_subject: 'Your caregiver directory link, for when you need a backup',
    email: 'Hi {first},\n\nA quick reminder from Caring Companions CDS: you have your own link to our private caregiver directory.\n\n{link}\n\nIf your caregiver ever needs time off, or you\'d like to add or change a caregiver, you can see caregivers near you, watch their short intro videos, and ask to meet them. When you open it, we\'ll send a code to your phone or email to confirm it\'s you.\n\nThe link is just for you, so please don\'t forward it. We send this reminder once every three months. If you\'d rather not get it, just reply and let us know.\n\n' + SIGN_OFF,
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
  profile: { version: 'profile-2026-11-25', text: 'I agree that Caring Companions CDS may show my first name, photo, town, the areas I work in, my availability, and the profile I wrote to families invited to its private caregiver directory, so they can ask to meet me. My last name, address and screening details are never shown. My phone and email are shown only if I agree below. I can change or remove my listing at any time.' },
  // Her word 2026-11-25: families reach caregivers directly; we are not the go-between.
  contact: { version: 'contact-2026-11-25', text: 'I agree that Caring Companions CDS may show my mobile phone number and email to families signed in to its private caregiver directory, so they can call, text or email me directly to set up an interview. I can stop sharing them at any time.' },
  video: { version: 'video-2026-10-15', text: 'I agree that Caring Companions CDS may show my intro video to families invited to its private caregiver directory. I can replace or remove it at any time, and it will be taken down when I ask.' },
};

export const PROVIDER_CHOICE = 'You can choose any CDS provider. Changes to your services go through the Division of Senior and Disability Services (1-866-835-3505). Your current services continue until new services are authorized.';
