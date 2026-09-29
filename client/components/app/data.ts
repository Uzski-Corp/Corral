/* Sample content for the Corral design study. People, companies and numbers are illustrative. */
import type { EnrichState } from "@/lib/discovery/run";
import type { Status } from "./primitives";

export const LOGOS = {
  "Kilima Dairies": ["#E8F0FE", "#1F5FD6", "K"],
  "Pwani Fresh": ["#FEF3E2", "#B45309", "P"],
  "Savanna Juice Co.": ["#ECFDF5", "#047857", "S"],
  "Tamu Bakeries": ["#F3F0FF", "#6D28D9", "T"],
  "Nyota Beverages": ["#FFF1F2", "#BE123C", "N"],
  "Rift Valley Grain": ["#F5F5F4", "#404040", "R"],
  "Mara Cold Stores": ["#E8F0FE", "#1F5FD6", "M"],
  "Bahari Foods": ["#FEF3E2", "#B45309", "B"],
  "Kivu Coffee Works": ["#ECFDF5", "#047857", "K"],
} as const;
export type CompanyName = keyof typeof LOGOS;

export type Lead = {
  /** company: a sample name with a logo tile, or any imported name (neutral tile). avatar "" = monogram. */
  id: string; company: CompanyName | (string & {}); domain: string; person: string; title: string; avatar: string;
  fit: number; email: Status; reply: Status; last: string; why: string[];
  /* M3 lead table: optional, so M1 rows still type-check */
  country?: string; size?: string; industry?: string; source?: string;
  /** Corral is still reading the site; fit isn't known yet */ scoring?: boolean;
  /** id of the lead this one probably duplicates */ dupOf?: string;
  /** M4: where the company is in discovery/enrichment; the table shows it in place of the value it waits for */ enrich?: EnrichState;
};
export const LEADS: Lead[] = [
  { id: "kilima", company: "Kilima Dairies", domain: "kilima.co.ke", person: "Wanjiru Mwangi", title: "Head of Supply Chain", avatar: "wanjiru", fit: 94, email: "Verified", reply: "Interested", last: "2h ago", why: ["Read 38 pages of kilima.co.ke", "Matched “3-site pilot” proof", "Replied in 2h"] },
  { id: "pwani", company: "Pwani Fresh", domain: "pwanifresh.com", person: "Brian Kamau", title: "COO", avatar: "kamau", fit: 91, email: "Verified", reply: "Objection", last: "5h ago", why: ["Four cold rooms, fish and dairy", "No live alerting", "Lost a container in March"] },
  { id: "savanna", company: "Savanna Juice Co.", domain: "savannajuice.africa", person: "Amara Nwosu", title: "Ops Director", avatar: "amara", fit: 88, email: "Verified", reply: "Not contacted", last: "—", why: ["Chilled juice line since 2024", "Two distribution hubs"] },
  { id: "tamu", company: "Tamu Bakeries", domain: "tamu.ug", person: "Reza Santos", title: "Plant Manager", avatar: "reza", fit: 86, email: "Catch-all", reply: "Contacted", last: "1d ago", why: ["Cold dough storage", "Expanding to Kampala"] },
  { id: "nyota", company: "Nyota Beverages", domain: "nyota.co.tz", person: "Grace Holloway", title: "VP Operations", avatar: "grace", fit: 84, email: "Verified", reply: "Meeting booked", last: "Thu 10:30", why: ["Dairy-based drinks", "QA team of 6"] },
  { id: "bahari", company: "Bahari Foods", domain: "baharifoods.co.ke", person: "Mark Ellison", title: "CFO", avatar: "mark", fit: 83, email: "Verified", reply: "Contacted", last: "3d ago", why: ["Frozen seafood exporter"] },
  { id: "rift", company: "Rift Valley Grain", domain: "rvgrain.co.ke", person: "Daniel Weber", title: "Procurement Lead", avatar: "daniel", fit: 81, email: "Verified", reply: "Not contacted", last: "—", why: ["Temperature-sensitive seed stock"] },
  { id: "mara", company: "Mara Cold Stores", domain: "maracold.com", person: "Lena Fischer", title: "Head of Quality", avatar: "lena", fit: 80, email: "Verified", reply: "Not contacted", last: "—", why: ["Third-party cold storage"] },
  { id: "kivu", company: "Kivu Coffee Works", domain: "kivucoffee.rw", person: "Sofia Brandt", title: "Cold-chain Lead", avatar: "sofia", fit: 64, email: "Catch-all", reply: "Not contacted", last: "—", why: ["Mostly ambient storage"] },
];

export type Thread = {
  id: string; avatar: string; name: string; company: CompanyName; title: string; fit: number; status: Status; time: string;
  unread?: boolean; snippet: string; subject: string; body: string; receipts: [string, string][];
  draft?: string[]; next?: [string, string, string][];
};
export const THREADS: Thread[] = [
  { id: "brian", avatar: "kamau", name: "Brian Kamau", company: "Pwani Fresh", title: "COO", fit: 91, status: "Objection", time: "09:42", unread: true,
    snippet: "Honestly the price is the blocker. We pay less for our current…", subject: "Re: Spoilage across your Mombasa cold rooms",
    body: "Honestly the price is the blocker. We pay less for our current loggers, even if they don’t alert anyone. Not sure I can make the case this quarter.",
    receipts: [["Classified as Objection · price", "1.2s"], ["Matched battlecard “Price vs. current loggers”", "ColdTrace Sensors"], ["Pulled proof: Kilima Dairies cut spoilage 31% in one quarter", "case study"]],
    draft: ["Fair point, Brian. Most teams compare us to loggers, but loggers only tell you what spoiled after the fact.",
      "Kilima ran the same numbers across three cold rooms and paid the sensors back in one quarter from avoided spoilage alone. Happy to walk you through their sheet in 20 minutes: cal.com/tomas/20min"],
    next: [["+3d", "Send the Kilima case study through AutoSend nurture", "auto"], ["+7d", "Try Mark Ellison, CFO, with the payback sheet", "needs approval"]] },
  { id: "wanjiru", avatar: "wanjiru", name: "Wanjiru Mwangi", company: "Kilima Dairies", title: "Head of Supply Chain", fit: 94, status: "Interested", time: "09:15", unread: true,
    snippet: "Could you pilot this across our three Nakuru sites before…", subject: "Re: Three sites, one alert",
    body: "Could you pilot this across our three Nakuru sites before the dry season? We lost two batches in February and I’d like to show the board something by November.",
    receipts: [["Classified as Interested · pilot request", "0.9s"], ["Found pilot terms in ColdTrace Sensors product sheet", "3 sites · 60 days"], ["Added Cal.com link", "tomas/20min"]],
    draft: ["Yes, and November is realistic. A three-site pilot runs 60 days, and we install in a morning per site.", "Could we take 20 minutes this week to pick the first rooms? cal.com/tomas/20min"],
    next: [["+2d", "Nudge with the 60-day pilot one-pager", "auto"]] },
  { id: "grace", avatar: "grace", name: "Grace Holloway", company: "Nyota Beverages", title: "VP Operations", fit: 84, status: "Meeting booked", time: "Yesterday",
    snippet: "Booked for Thursday 10:30. Adding our QA lead, Mercy.", subject: "Re: Your QA team and the night shift",
    body: "Booked for Thursday 10:30. Adding our QA lead, Mercy, since she’ll own the rollout.",
    receipts: [["Classified as Meeting booked", "0.7s"], ["Sequence stopped at step 3", "auto"], ["Deal opened in Phoenix ERP", "PX-2288"]],
    next: [["−24h", "AutoSend: Kilima case study to Grace and Mercy", "scheduled"]] },
  { id: "daniel", avatar: "daniel", name: "Daniel Weber", company: "Rift Valley Grain", title: "Procurement Lead", fit: 81, status: "OOO", time: "Yesterday",
    snippet: "I’m out of office until 14 October. For urgent…", subject: "Automatic reply",
    body: "I’m out of office until 14 October. For urgent matters please contact procurement@rvgrain.co.ke.",
    receipts: [["Classified as OOO · back 14 Oct", "0.4s"], ["Sequence paused, resumes 15 Oct 09:00", "auto"]] },
  { id: "reza", avatar: "reza", name: "Reza Santos", company: "Tamu Bakeries", title: "Plant Manager", fit: 86, status: "Not interested", time: "Mon",
    snippet: "Not for us right now, we just renewed with our vendor.", subject: "Re: Cold dough, warm Kampala afternoons",
    body: "Not for us right now, we just renewed with our vendor. Maybe next year.",
    receipts: [["Classified as Not interested · timing", "0.8s"], ["Removed from sequence", "auto"], ["Reminder set for renewal window", "Aug 2027"]] },
  { id: "amara", avatar: "amara", name: "Amara Nwosu", company: "Savanna Juice Co.", title: "Ops Director", fit: 88, status: "Interested", time: "Mon",
    snippet: "Who else in dairy is using this? Send me a case study.", subject: "Re: Two hubs, one dashboard",
    body: "Who else in dairy is using this? Send me a case study and I’ll share it with our founders.",
    receipts: [["Classified as Interested · proof request", "1.0s"], ["Attached Kilima Dairies case study", "PDF · 2 pages"]],
    draft: ["Of course. Kilima Dairies is the closest to you: three sites, chilled product, 31% less spoilage in a quarter. The case study is attached.", "If your founders want the numbers live, I can walk them through it: cal.com/tomas/20min"] },
  { id: "sofia", avatar: "sofia", name: "Sofia Brandt", company: "Kivu Coffee Works", title: "Cold-chain Lead", fit: 64, status: "Referral", time: "Sun",
    snippet: "Forwarding to our QA manager. She owns this budget.", subject: "Re: Green bean storage",
    body: "Forwarding to our QA manager, Aline. She owns this budget and she’s the right person for this.",
    receipts: [["Classified as Referral → Aline Uwase", "1.1s"], ["Found aline@kivucoffee.rw", "verified"], ["Drafted intro that mentions Sofia", "ready"]] },
];
