/* Every word of the pricing gate (Bau, COPY.md, Oct 17). Sentence case, curly apostrophes, no exclamation marks.
   Strings marked ◆ are the waitlist's own (landing-v/copy.ts WAITLIST). */
import { WAITLIST } from "@/components/marketing/landing-v/copy";

export const PRICING_GATE = {
  kicker: "Pricing",
  title: "Pricing, by email.",
  lede: "Tell us a little about you and we’ll send it to your inbox.",
  open: "See pricing",
  dialog: { title: "See pricing by email", description: "A few details, then the pricing lands in your inbox.", close: "Close" },
  fields: {
    fullName: { label: "Full name", placeholder: "Wanjiru Kamau" },
    industry: { label: "Industry", placeholder: "Search or choose", search: "Search industries", none: "No match" },
    other: { label: "Your industry", placeholder: "In a few words" },
    email: { label: "Work email", placeholder: WAITLIST.placeholder, hint: "The pricing goes here." },
    phone: { label: "Phone", optional: "Optional", placeholder: "+254 712 345 678", hint: "Include the country code, like +254 712 345 678. Only so the team can reach you." },
  },
  submit: "Email me the pricing",
  busy: "Sending",
  consent: { before: "By continuing, you agree we can email you the pricing and, if you add a number, call or message you about Corral. Read our ", link: "Privacy policy", after: "." },
  errors: {
    fullName: "Add your name so we know who to write to.",
    industry: "Choose your industry.",
    otherText: "Tell us your industry in a few words.",
    email: WAITLIST.invalid,
    phone: "That number doesn’t look right. Start with +254 or your country code.",
  },
  freeMail: { note: "That looks like a personal address. A work email helps us send the right pricing.", send: "Send anyway" },
  success: { title: "Check your inbox.", body: (email: string) => `We sent the pricing to ${email}. It can take a minute.`, more: "Not there? Look in spam, or ", again: "send it again", close: "Close" },
  failure: { title: "We couldn’t send that just now.", body: "Nothing was lost. Try again in a minute.", retry: "Try again" },
  limited: { title: "That’s a lot of tries from here.", body: "Wait a few minutes, then try again. Your answers are still here.", button: (wait: string) => `Try again in ${wait}` },
} as const;
