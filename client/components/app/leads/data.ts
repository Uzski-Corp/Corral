/* Sample lead table for M3 (ENG-53). The first nine rows are the M1 LEADS; the rest fill a real page. People, companies and numbers are illustrative. */
import { LEADS, type Lead } from "../data";
import type { Status } from "../primitives";
import type { Csv, Existing } from "@/lib/leads/import";

/** Everything Corral has found and scored in this workspace; the table shows one page (48). */
export const TOTAL_COMPANIES = 1284;
export const FIT_80 = 212;

const M1_EXTRA: Record<string, Partial<Lead>> = {
  kilima: { country: "Kenya", size: "201–1,000", industry: "Dairy", source: "Corral search" },
  pwani: { country: "Kenya", size: "51–200", industry: "Seafood", source: "Corral search" },
  savanna: { country: "Kenya", size: "51–200", industry: "Beverages", source: "CSV import" },
  tamu: { country: "Uganda", size: "51–200", industry: "Bakery", source: "Corral search" },
  nyota: { country: "Tanzania", size: "201–1,000", industry: "Beverages", source: "Corral search" },
  bahari: { country: "Kenya", size: "201–1,000", industry: "Seafood", source: "CSV import" },
  rift: { country: "Kenya", size: "1,000+", industry: "Grain", source: "Corral search" },
  mara: { country: "Kenya", size: "51–200", industry: "Cold storage", source: "Manual" },
  kivu: { country: "Rwanda", size: "1–50", industry: "Coffee", source: "Corral search" },
};

// id | company | domain | person | title | fit | email | reply | last | country | size | industry | source
const MORE = `
dodoma|Dodoma Dairy Co-op|dodomadairy.co.tz|Neema Mushi|General Manager|87|Verified|Contacted|2d ago|Tanzania|201–1,000|Dairy|Corral search
lakeside|Lakeside Fisheries|lakesidefish.ug|Okello James|Operations Manager|86|Verified|Interested|6h ago|Uganda|51–200|Seafood|Corral search
arusha|Arusha Fresh Meats|arushameats.co.tz|Joseph Lema|Plant Manager|85|Catch-all|Not contacted|—|Tanzania|51–200|Cold storage|CSV import
kigali|Kigali Cold Chain|kigalicold.rw|Aline Uwase|QA Manager|85|Verified|Referral|Sun|Rwanda|51–200|Cold storage|Corral search
mombasa|Mombasa Reefer Logistics|mombasareefer.com|Hassan Omar|Fleet Director|84|Verified|Contacted|4d ago|Kenya|201–1,000|Cold storage|Corral search
ruiru|Ruiru Poultry|ruirupoultry.co.ke|Mercy Njeri|Head of Quality|84|Verified|Not contacted|—|Kenya|201–1,000|Cold storage|CSV import
entebbe|Entebbe Flowers Export|entebbeflowers.ug|Sarah Nakato|Export Manager|83|Unverified|Not contacted|—|Uganda|51–200|Cold storage|CSV import
nakuru|Nakuru Milk Processors|nakurumilk.co.ke|Peter Kiprono|COO|83|Verified|Objection|1d ago|Kenya|201–1,000|Dairy|Corral search
zanzibar|Zanzibar Spice Cold Rooms|zanzispice.co.tz|Fatma Said|Owner|82|Catch-all|Contacted|5d ago|Tanzania|1–50|Cold storage|Manual
eldoret|Eldoret Grain Millers|eldoretgrain.co.ke|Kevin Rotich|Procurement Lead|82|Verified|Not contacted|—|Kenya|1,000+|Grain|Corral search
jinja|Jinja Breweries|jinjabrew.ug|Isaac Mugisha|Brewmaster|81|Verified|Meeting booked|Fri 14:00|Uganda|201–1,000|Beverages|Corral search
addis|Addis Pharma Distribution|addispharma.et|Selam Tesfaye|Supply Chain Director|81|Verified|Not contacted|—|Ethiopia|201–1,000|Pharma|Corral search
thika|Thika Fruit Packers|thikafruit.co.ke|Grace Wambui|Operations Lead|80|Verified|Contacted|1d ago|Kenya|51–200|Beverages|CSV import
mwanza|Mwanza Fish Processors|mwanzafish.co.tz|Baraka Mollel|Plant Director|80|Bounced|Contacted|6d ago|Tanzania|201–1,000|Seafood|CSV import
kampala|Kampala Ice Cream Co.|kampalaice.ug|Ruth Nambi|Founder|80|Verified|Not contacted|—|Uganda|1–50|Dairy|Corral search
lagos|Lagos Chilled Foods|lagoschilled.ng|Tunde Adebayo|Head of Logistics|79|Verified|Not contacted|—|Nigeria|1,000+|Cold storage|Corral search
kisumu|Kisumu Tilapia Farms|kisumutilapia.co.ke|Otieno Odhiambo|Farm Manager|78|Catch-all|Not contacted|—|Kenya|51–200|Seafood|Corral search
moshi|Moshi Coffee Curing|moshicoffee.co.tz|Anna Kimaro|Quality Lead|77|Verified|Not interested|Mon|Tanzania|51–200|Coffee|Corral search
gulu|Gulu Oilseed Mills|guluoil.ug|Daniel Okot|Mill Manager|76|Unverified|Not contacted|—|Uganda|201–1,000|Grain|CSV import
huye|Huye Dairy|huyedairy.rw|Eric Habimana|Managing Director|75|Verified|Contacted|3d ago|Rwanda|1–50|Dairy|Corral search
nyeri|Nyeri Highland Dairies|nyeridairies.co.ke|Esther Muthoni|Plant Manager|74|Verified|Unsubscribed|Sep 12|Kenya|51–200|Dairy|Corral search
tanga|Tanga Fresh Juices|tangajuice.co.tz|Omari Juma|Sales Director|73|Catch-all|Not contacted|—|Tanzania|51–200|Beverages|CSV import
malindi|Malindi Seafood Exports|malindiseafood.co.ke|Ali Abdalla|Export Lead|72|Verified|OOO|Tue|Kenya|51–200|Seafood|Corral search
mbarara|Mbarara Milk Collectors|mbararamilk.ug|Brenda Ainembabazi|Operations Manager|71|Verified|Not contacted|—|Uganda|1–50|Dairy|Corral search
naivasha|Naivasha Flower Farms|naivashaflowers.co.ke|Tom Wekesa|Cold Room Supervisor|70|Unverified|Not contacted|—|Kenya|1,000+|Cold storage|CSV import
bujumbura|Bujumbura Beverages|bujabev.bi|Claude Ndayishimiye|Plant Manager|68|Catch-all|Not contacted|—|Rwanda|201–1,000|Beverages|Corral search
kericho|Kericho Tea Packers|kerichotea.co.ke|Janet Chebet|Warehouse Lead|66|Verified|Not contacted|—|Kenya|201–1,000|Beverages|Corral search
dar|Dar Bakers Supply|darbakers.co.tz|Hamisi Ally|Owner|64|Unverified|Not contacted|—|Tanzania|1–50|Bakery|Manual
fortportal|Fort Portal Honey|fphoney.ug|Joan Kyomuhendo|Founder|61|Catch-all|Not contacted|—|Uganda|1–50|Bakery|CSV import
machakos|Machakos Mango Co.|machakosmango.co.ke|Paul Mutua|Operations|58|Verified|Not contacted|—|Kenya|51–200|Beverages|Corral search
hawassa|Hawassa Fish Market|hawassafish.et|Dawit Bekele|Manager|55|Unverified|Not contacted|—|Ethiopia|1–50|Seafood|CSV import
kilimaltd|Kilima Dairies Ltd|kilimadairies.co.ke|Wanjiru M.|Supply Chain|—|Unverified|Not contacted|—|Kenya|201–1,000|Dairy|CSV import
`;
const AV = new Set(["amara", "daniel", "grace", "kamau", "lena", "mark", "reza", "sofia", "wanjiru"]);
const more: Lead[] = MORE.trim().split("\n").map((line) => {
  const [id, company, domain, person, title, fit, email, reply, last, country, size, industry, source] = line.split("|");
  return { id, company, domain, person, title, avatar: AV.has(id) ? id : "", fit: fit === "—" ? 0 : Number(fit), email: email as Status, reply: reply as Status, last,
    why: [], country, size, industry, source, ...(id === "kilimaltd" ? { dupOf: "kilima", scoring: true } : {}) };
});
export const LEAD_ROWS: Lead[] = [...LEADS.map((l) => ({ ...l, ...M1_EXTRA[l.id] })), ...more];
export const leadById = (id: string) => LEAD_ROWS.find((l) => l.id === id);

/** Work email as the sample would have it (first name at the domain). */
export const emailOf = (l: Pick<Lead, "person" | "domain">) => `${l.person.split(/[\s.]+/)[0].toLowerCase()}@${l.domain}`;
export const EXISTING: Existing[] = LEAD_ROWS.map((l) => ({ id: l.id, company: l.company, domain: l.domain, email: emailOf(l) }));

/* ------------------------------------------------------------ lead detail */
export type Activity = { when: string; what: string; who?: string; tone?: "pos" | "warn" | "neg" };
export type Person = { name: string; title: string; avatar?: string; email: string; status: Status; primary?: boolean };
export type LeadDetailData = { people: Person[]; activity: Activity[]; segments: string[]; notes?: string; sequence?: string };

export function detailOf(l: Lead): LeadDetailData {
  const base: LeadDetailData = {
    people: [{ name: l.person, title: l.title, avatar: l.avatar || undefined, email: emailOf(l), status: l.email, primary: true }],
    activity: [{ when: "Sep 22", what: `Found by ${l.source === "CSV import" ? "CSV import · trade-show-leads.csv" : "Corral search · “cold rooms East Africa”"}` }, { when: "Sep 22", what: `Scored ${l.fit} for ColdTrace Sensors` }],
    segments: l.fit >= 80 ? ["F&B · East Africa"] : [],
  };
  if (l.id === "kilima") return {
    people: [base.people[0], { name: "Joseph Kariuki", title: "Plant Manager, Nakuru", email: "joseph@kilima.co.ke", status: "Verified" }, { name: "Mercy Achieng", title: "QA Lead", email: "mercy@kilima.co.ke", status: "Catch-all" }],
    activity: [
      { when: "2h ago", what: "Replied: “Could you pilot this across our three Nakuru sites…”", who: "Wanjiru Mwangi", tone: "pos" },
      { when: "2h ago", what: "Status set to Interested by Corral (pilot request)" },
      { when: "Sep 26", what: "Step 2 sent · “Three sites, one alert”", who: "Cold-room pilot" },
      { when: "Sep 24", what: "Step 1 sent · opened twice", who: "Cold-room pilot" },
      { when: "Sep 22", what: "Enrolled in Cold-room pilot by Tomás Ibarra" },
      ...base.activity,
    ],
    segments: ["F&B · East Africa", "Dairy · 3+ sites"], sequence: "Cold-room pilot · step 2 of 4, paused (replied)",
    notes: "Board meeting in November. Wanjiru wants numbers from one dry-season month.",
  };
  if (l.id === "pwani") return { ...base, activity: [{ when: "5h ago", what: "Replied: “Honestly the price is the blocker…”", who: "Brian Kamau", tone: "warn" }, { when: "5h ago", what: "Status set to Objection by Corral (price)" }, ...base.activity],
    sequence: "Cold-room pilot · step 3 of 4, paused (replied)" };
  // M8: Grace booked through Cal.com; the sequence stopped and the deal went to Phoenix (HANDOFF §16).
  if (l.id === "nyota") return { ...base, activity: [{ when: "Yesterday", what: "Booked Thu 1 Oct, 10:30 through Cal.com", who: "Grace Holloway", tone: "pos" },
    { when: "Yesterday", what: "Deal PX-2288 opened in Phoenix ERP at Discovery" }, ...base.activity],
    sequence: "Cold-room pilot · step 3 of 4, stopped (meeting booked)" };
  return base;
}

/* ------------------------------------------------------------ CSV samples */
const firstNames = ["Achieng", "Baraka", "Chausiku", "Dennis", "Eunice", "Faith", "George", "Halima", "Ibrahim", "Jane", "Kamau", "Lilian", "Moses", "Nafula", "Owen", "Purity", "Rashid", "Salome", "Tobias", "Wairimu"];
const towns = ["Nanyuki", "Kitale", "Embu", "Meru", "Kakamega", "Bungoma", "Kericho", "Garissa", "Nyahururu", "Voi"];
const kinds = ["Dairies", "Cold Rooms", "Fresh Produce", "Meat Packers", "Fish Traders", "Juice Works"];
/** A 64-row trade-show export: 3 bad emails, 1 row with no company, 4 companies already in Corral, 2 repeated in the file. */
export function tradeShowCsv(): string {
  const rows = [["Company", "Website", "Contact name", "Email", "Job title", "Country", "Employees", "Booth notes"]];
  for (let i = 0; i < 55; i++) {
    const co = `${towns[i % 10]} ${kinds[i % 6]}${i >= 30 ? " Ltd" : ""}`, dom = `${towns[i % 10].toLowerCase()}${kinds[i % 6].toLowerCase().replace(/\s/g, "")}${i >= 30 ? "ltd" : ""}.co.ke`;
    const fn = firstNames[i % 20];
    rows.push([co, `https://www.${dom}`, `${fn} ${["Otieno", "Wanjala", "Mutiso", "Chege"][i % 4]}`, `${fn.toLowerCase()}@${dom}`, ["Operations Manager", "Owner", "Plant Manager", "QA Lead"][i % 4], "Kenya", ["51-200", "1-50", "201-1000"][i % 3], i % 7 === 0 ? "Asked about solar backup" : ""]);
  }
  rows[5][3] = "achieng.at.kitale"; rows[18][3] = "rashid@"; rows[40][3] = "salome otieno@nyahururu.co.ke";
  rows[27][0] = ""; rows[27][1] = "";
  rows.push(["Kilima Dairies", "kilima.co.ke", "Wanjiru Mwangi", "wanjiru@kilima.co.ke", "Head of Supply Chain", "Kenya", "201-1000", "Met at booth 14"]);
  rows.push(["Pwani Fresh", "pwanifresh.com", "Brian Kamau", "brian@pwanifresh.com", "COO", "Kenya", "51-200", ""]);
  rows.push(["Nyota Beverages", "nyota.co.tz", "Grace Holloway", "grace@nyota.co.tz", "VP Operations", "Tanzania", "201-1000", ""]);
  rows.push(["Bahari Foods", "https://baharifoods.co.ke/", "Mark Ellison", "mark@baharifoods.co.ke", "CFO", "Kenya", "201-1000", ""]);
  rows.push([...rows[3]]); rows.push([...rows[9]]);
  rows.push(["Ruiru Poultry", "ruirupoultry.co.ke", "Mercy Njeri", "", "Head of Quality", "Kenya", "201-1000", "No email card"]);
  rows.push(["Eldoret Coolers", "eldoretcoolers.co.ke", "Ben Kiptoo", "ben@eldoretcoolers.co.ke", "Owner", "Kenya", "1-50", ""]);
  rows.push(["Meru Greens", "merugreens.co.ke", "Lucy Kawira", "lucy@merugreens.co.ke", "Exports", "Kenya", "51-200", ""]);
  const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}
/** A CRM export whose columns need a human: no company column Corral recognises, two email columns, full and split names. */
export function crmExportCsv(): string {
  return [
    "Record ID,Associated Company,First Name,Last Name,Full name,Email,Secondary email,Lifecycle stage",
    "10231,Kitale Dairies,Achieng,Otieno,Achieng Otieno,achieng@kitaledairies.co.ke,a.otieno@gmail.com,Lead",
    "10232,Embu Cold Rooms,Baraka,Wanjala,Baraka Wanjala,baraka@embucold.co.ke,baraka.w@yahoo.com,Lead",
    "10233,Meru Fresh Produce,Chausiku,Mutiso,Chausiku Mutiso,chausiku@merufresh.co.ke,chau@gmail.com,MQL",
    "10234,Voi Meat Packers,Dennis,Chege,Dennis Chege,dennis@voimeat.co.ke,dchege@outlook.com,Lead",
  ].join("\n");
}
export type CsvSample = { name: string; size: number; csv: Csv };
