/**
 * The Terms of Service and Privacy Notice text (ENG-87c). Modelled on Uzski Corp's own terms and privacy notice
 * (uzski-corp-landing app/terms and app/privacy): the same entity, addresses and IP owner (Uzski Corp, Nairobi),
 * with Corral as the product. Each section is a heading and its paragraphs (one block under the heading), which is what Bau's LegalPage outline
 * renders today; his richer layout (contents, sub-headings, lists, a subprocessor table) is a later batch.
 *
 * `[TODO for Sean: …]` marks a fact nobody has confirmed yet. Don't guess; Sean fills these in, then the "legal"
 * claim in lib/marketing/site.ts is confirmed, which drops noindex and adds the pages to the sitemap.
 */
export const LEGAL_UPDATED = "30 September 2026";
export const LEGAL_TODO = "[TODO for Sean";

export type LegalSection = { id: string; title: string; body: string[] };

const ADDRESS = "Abc Place Nairobi, Waiyaki Way, Nairobi, Nairobi County 00100, Kenya";

export const TERMS: LegalSection[] = [
  { id: "agreement", title: "Agreement to these terms", body: [
    `We are Uzski Corp ("Company", "we", "us" or "our"), a company registered in Kenya at ${ADDRESS}. We build and operate Corral, the service at corral.app and the Corral app, API and MCP server (together, the "Services"). [TODO for Sean: confirm the production domain; corral.app is the placeholder the site uses.]`,
    "These Terms of Service (the \"Terms\") are a legally binding agreement between you, personally or on behalf of the organisation you sign in for (\"you\"), and Uzski Corp about your access to and use of the Services. By signing in or otherwise using the Services you agree to these Terms. If you do not agree, do not use the Services.",
    "If you use Corral on behalf of an organisation, you confirm you have authority to bind it, and \"you\" includes that organisation and its workspace.",
    "You can contact us by phone at +254 745 071 299, by email at hello@uzskicorp.agency, or by post to Uzski Corp, " + ADDRESS + ". [TODO for Sean: confirm whether Corral gets its own support and legal addresses (the site uses legal@corral.app and hello@corral.app) or keeps Uzski Corp's.]",
    "The Services are intended for people who are at least 18 years old and are using them for business purposes.",
  ] },
  { id: "services", title: "What Corral does", body: [
    "Corral is outbound-sales software. You describe what you sell (a product and its knowledge base of documents and web pages), Corral finds and scores companies that fit it, finds the right person at each, verifies their email, and helps you write to them from your own mailboxes, then sorts the replies and hands booked meetings to your other systems.",
    "Some features rely on third-party services you connect or that we use on your behalf, such as your email provider, a scheduling tool, an ERP, and data and AI providers (see the Privacy Notice for the list). Their availability and terms are outside our control.",
    "We may add, change or retire features. When a change materially reduces what a paid plan includes, we will tell workspace owners in advance.",
  ] },
  { id: "account", title: "Your account and workspace", body: [
    "You sign in through WorkOS, our authentication provider, with Google, Microsoft or a one-time email code. You are responsible for keeping access to your email and sign-in methods secure, and for everything done under your account.",
    "A workspace has owners and members. Owners manage members, billing, connected mailboxes and integrations, and API keys. You are responsible for who you invite and what access you give them.",
    "API keys and MCP connections act for your workspace. Treat keys as secrets, give them only the scopes they need, and revoke any key you believe is exposed. Anything done with a valid key or connection counts as done by your workspace.",
  ] },
  { id: "sending", title: "Sending email with Corral", body: [
    "Corral sends email only through mailboxes you connect and control. You are the sender of every message: you choose the recipients, approve the sequences, and are responsible for what is sent in your name.",
    "You must comply with the laws that apply to your outreach, including anti-spam and data-protection laws in your country and in the recipient's (for example the Kenya Data Protection Act 2019, the EU and UK GDPR and ePrivacy rules, CAN-SPAM and CASL where relevant). You must have a lawful basis to contact each person, identify yourself honestly, and honour opt-outs.",
    "Every sequence carries an unsubscribe option. When someone unsubscribes, bounces, or asks not to be contacted, Corral adds them to your workspace's suppression list and stops writing to them. You must not remove people from the suppression list to contact them again without their consent, or work around it.",
    "We may pause sending from a workspace or a mailbox to protect recipients, deliverability, or our providers — for example after high bounce or complaint rates — and will tell you why.",
  ] },
  { id: "your-data", title: "Your content and data", body: [
    "\"Your content\" means what you and your workspace put into Corral or have Corral collect for you: products, uploaded files and the web pages you add to a knowledge base, lead, company and contact records (including CSV imports), sequences, emails and replies, notes, and settings. You own your content.",
    "You give us a worldwide, non-exclusive licence to host, copy, process, transmit and display your content only as needed to provide, secure and support the Services for you, including sending it to the subprocessors listed in our Privacy Notice. We do not sell your content, and we do not use it to train general-purpose AI models. [TODO for Sean: confirm this no-training commitment holds for every LLM and embeddings provider under our contracts.]",
    "You confirm that you have the rights and permissions needed for the content you upload or import and for Corral to process it as described, including any personal data about the people in your lead lists.",
    "For personal data in your content, you are the controller and Uzski Corp processes it on your behalf as your processor, under our Data Processing Agreement.",
  ] },
  { id: "web-reads", title: "Pages Corral reads from the web", body: [
    "When you add a web page to a knowledge base, or when Corral researches a company, Corral fetches public pages as \"CorralBot\". It respects robots.txt, reads only pages anyone can open without signing in, does not follow private or local network addresses, and limits how much it reads from any one site.",
    "Discovery and enrichment use public web pages and data providers. The results — company details, fit scores and the reasons behind them, contact names and titles, and verified email addresses — are provided to help you decide who to contact; you are responsible for checking them before you act on them.",
  ] },
  { id: "ip", title: "Intellectual property", body: [
    "Uzski Corp owns or licenses all intellectual property rights in the Services, including the Corral software, source code, designs, text, graphics and the Corral name and marks (the \"Content and Marks\"). They are protected by copyright, trademark and other laws. These Terms do not transfer any of them to you.",
    "Subject to these Terms, we grant you a non-exclusive, non-transferable, revocable right to use the Services for your internal business purposes while your subscription is active.",
    "If you send us suggestions or feedback, we may use them without restriction or obligation to you.",
  ] },
  { id: "prohibited", title: "What you must not do", body: [
    "You must not: send unsolicited bulk email or email to people who have opted out; import lists you have no right to use; contact people to harass, deceive or discriminate; impersonate anyone; send malware or phishing; use Corral to collect data about people for purposes unrelated to legitimate business outreach; probe, scan or attack the Services or other workspaces; circumvent limits, suppression, robots.txt handling or security controls; resell the Services or use them to build a competing product; or use the Services in breach of any law or third-party terms (including your email provider's).",
    "We may investigate suspected violations and suspend or end access, and report unlawful activity to the authorities.",
  ] },
  { id: "payment", title: "Plans and payment", body: [
    "Paid plans are billed in advance for each billing period at the price shown when you subscribe, plus applicable taxes. Plans include a number of company reads (discovery and fit scoring) per period; unused reads do not carry over unless the plan says so.",
    "You can change or cancel your plan at any time; cancellation takes effect at the end of the current billing period, and fees already paid are not refunded except where the law requires it. [TODO for Sean: payment processor, currency, trial terms (the site mentions a 14-day trial) and refund policy.]",
    "We may change prices with at least 30 days' notice to workspace owners; a change applies from your next billing period.",
  ] },
  { id: "third-party", title: "Integrations and third-party services", body: [
    "When you connect a mailbox (Google Workspace or Microsoft 365), a scheduling tool (such as Cal.com), your ERP (for example the Phoenix ERP handoff that creates a deal when a meeting is booked), or an MCP client (such as Cursor or Claude), you authorise Corral to exchange the data needed for that integration. Your use of those services is governed by their terms, and you can disconnect them at any time in Settings.",
    "We are not responsible for third-party services, their availability, or what they do with data you send them.",
  ] },
  { id: "ai", title: "AI features", body: [
    "Corral uses AI models to score fit, explain the score, classify replies and draft messages and replies. AI output can be wrong or incomplete. Corral shows where each claim came from, but you decide what to send; nothing is sent in your name without your approval unless you turn on an automation that says otherwise.",
  ] },
  { id: "confidentiality", title: "Confidentiality and security", body: [
    "We keep your content confidential and use it only to provide the Services. We protect it with the measures described on our Security page, including encryption in transit, workspace isolation enforced in the database, and access controls. No system is perfectly secure, and we will tell affected workspace owners without undue delay if a breach affects their data.",
  ] },
  { id: "term", title: "Term, suspension and termination", body: [
    "These Terms apply while you use the Services. You can stop using Corral and close your workspace at any time. We may suspend or end your access if you breach these Terms, if you don't pay, or if we must do so by law, and will give notice where we reasonably can.",
    "When a workspace is closed, you can export your data first; afterwards we delete it as described in the Privacy Notice. Sections that by their nature should survive (such as ownership, payment owed, disclaimers, limits of liability and governing law) survive termination.",
  ] },
  { id: "changes", title: "Changes and interruptions", body: [
    "We may update these Terms. We will post the new version here with a new date and, for material changes, tell workspace owners by email at least 14 days before they take effect. Continuing to use the Services after that means you accept the updated Terms.",
    "We aim to keep the Services available but do not guarantee uninterrupted access. We may need to pause them for maintenance, security or reasons outside our control, and are not liable for loss caused by such interruptions.",
  ] },
  { id: "law", title: "Governing law and disputes", body: [
    "These Terms are governed by the laws of Kenya. You and Uzski Corp agree that the courts of Kenya have exclusive jurisdiction over any dispute arising from these Terms or the Services. Uzski Corp may also bring proceedings in the courts of the country where you reside or have your principal place of business.",
    "Before starting proceedings, each party agrees to try to resolve the dispute informally for at least 30 days by writing to the other.",
  ] },
  { id: "disclaimer", title: "Disclaimer", body: [
    "THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT DATA FROM THIRD-PARTY PROVIDERS OR THE WEB, FIT SCORES OR AI OUTPUT ARE ACCURATE OR COMPLETE, OR THAT ANY EMAIL WILL BE DELIVERED OR ANSWERED.",
  ] },
  { id: "liability", title: "Limitation of liability", body: [
    "TO THE FULLEST EXTENT PERMITTED BY LAW, UZSKI CORP WILL NOT BE LIABLE FOR ANY INDIRECT, CONSEQUENTIAL, SPECIAL OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE OR DATA, ARISING FROM YOUR USE OF THE SERVICES. OUR TOTAL LIABILITY FOR ANY CLAIM IS LIMITED TO THE AMOUNT YOU PAID US FOR THE SERVICES IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO IT. [TODO for Sean: confirm the liability cap.]",
  ] },
  { id: "indemnity", title: "Indemnification", body: [
    "You agree to defend and indemnify Uzski Corp and its officers and employees against claims, losses and costs (including reasonable legal fees) arising from your content, the emails you send with Corral, your breach of these Terms, or your breach of law or of anyone's rights.",
  ] },
  { id: "misc", title: "General", body: [
    "These Terms, the Privacy Notice and the Data Processing Agreement are the entire agreement between you and us about the Services. If a provision is unenforceable, the rest stay in effect. Our not enforcing a right is not a waiver. You may not assign these Terms without our consent; we may assign them to an affiliate or a successor. Notices to you may be sent electronically, and you agree that electronic communications, agreements and signatures satisfy any requirement that they be in writing.",
    `Questions about these Terms: hello@uzskicorp.agency, or Uzski Corp, ${ADDRESS}.`,
  ] },
];

export const PRIVACY: LegalSection[] = [
  { id: "about", title: "About this notice", body: [
    "This Privacy Notice explains how Uzski Corp (\"we\", \"us\" or \"our\") collects, uses, shares and protects personal information when you visit the Corral website, use the Corral app, API or MCP server (the \"Services\"), or when Corral processes information about you on behalf of one of our customers.",
    "It covers two groups of people: our customers and their team members who use Corral (\"users\"), and the people our customers research and write to with Corral (\"prospects\"). For prospects' data, the customer is the controller and we process it on the customer's behalf; for users' account data and our website, we are the controller.",
    "Questions or concerns: privacy@uzskicorp.agency. [TODO for Sean: confirm whether Corral gets its own privacy address.]",
  ] },
  { id: "summary", title: "Summary of key points", body: [
    "We collect account details when you sign in, the content your workspace puts into Corral, and — for our customers — business contact information about prospects from imports, public web pages and data providers. We use it to run Corral and nothing else we don't say here. We do not sell personal information and do not use customer content to train general-purpose AI models. We use service providers (listed below) to host, email, verify and analyse data under contract. Prospects can opt out of any Corral email with one click, and anyone can ask us or the customer what we hold about them.",
  ] },
  { id: "collect", title: "What information we collect", body: [
    "Account information. When you sign in, our authentication provider WorkOS gives us your name, work email address, profile picture (if your Google or Microsoft account has one) and the organisation you sign in for. We record your role in the workspace and when you sign in.",
    "Workspace content. What you add to Corral: products and their descriptions; files you upload to a knowledge base (PDF, DOCX, Markdown) and web pages you add; lead, company and contact records you create or import from CSV; segments, sequences, emails and replies in connected mailboxes; notes; and settings. Files you upload can contain personal information; you choose what to upload.",
    "Prospect information. On a customer's instructions, Corral collects business contact information about people at companies that may fit the customer's product: name, job title, work email address and its verification status, company, country and company size, public professional profile links, the public web pages Corral read about the company, and the history of emails, replies, unsubscribes and meetings with that customer. It comes from the customer's own imports, from public websites, and from the data providers listed below.",
    "Connected services. When a customer connects a mailbox (Google Workspace or Microsoft 365), Corral accesses the messages needed to send sequences and sort replies, and stores the connection's tokens encrypted. When a customer connects a scheduling tool or an ERP, Corral exchanges the meeting and deal details needed for the handoff.",
    "API and MCP use. For API keys and MCP connections we record which client or key made each call, what it did, and when, so owners can review activity.",
    "Technical information. Our servers log IP addresses, browser and device details, and requests, to keep the Services secure and working. [TODO for Sean: log retention period, and whether we use any website analytics.]",
    "We do not intentionally collect sensitive personal information (such as health, religion or biometric data), and customers must not upload it.",
  ] },
  { id: "use", title: "How we use information", body: [
    "To provide the Services: sign you in, keep your session, run your workspace, read your knowledge base, find and score companies, find and verify contacts, send the emails you approve, sort replies, and hand booked meetings to your connected systems.",
    "To keep the Services safe: prevent fraud and abuse, enforce sending limits and suppression, and investigate security incidents.",
    "To support and improve Corral: answer requests, fix problems and understand, in aggregate, how features are used. We do not use customer content or prospect data to train general-purpose AI models.",
    "To communicate with users about their account, security, billing and material changes. Product news only if you opt in, with an unsubscribe link in every message.",
    "To comply with law and respond to lawful requests.",
  ] },
  { id: "bases", title: "Legal bases", body: [
    "Where laws such as the Kenya Data Protection Act 2019 or the EU/UK GDPR apply, we rely on: performance of our contract with customers (running the Services); our legitimate interests in securing and improving the Services; consent where we ask for it (for example product news); and legal obligations. For prospect data, the customer decides the legal basis for its outreach (typically legitimate interest in business-to-business contact) and is responsible for it; we process that data on the customer's instructions.",
  ] },
  { id: "share", title: "Who we share information with", body: [
    "We share personal information only with service providers that process it for us under contract (subprocessors), with the services a customer chooses to connect, and where the law requires.",
    "Subprocessors: WorkOS (sign-in and sessions); our hosting and database providers [TODO for Sean: name the hosting, database, object storage and Redis providers and their regions]; Hunter and Dropcontact (finding business email addresses); ZeroBounce (verifying email deliverability); a web search provider for company discovery [TODO for Sean: confirm Serper]; embeddings providers that turn knowledge-base text into search vectors [TODO for Sean: name the embeddings provider; the default is an OpenAI-compatible API]; and large-language-model providers that score fit, classify replies and draft messages [TODO for Sean: name the LLM providers, e.g. Google Gemini and Anthropic Claude, and their data-retention terms]; and our email provider for account emails [TODO for Sean: name it].",
    "Services customers connect: Google Workspace or Microsoft 365 mailboxes for sending and replies; Cal.com or another scheduler for meetings; the customer's ERP (for example Phoenix) for the deal handoff; AutoSend for nurture email if the customer turns it on; and MCP clients such as Cursor or Claude that a user connects to their workspace.",
    "Business transfers: if Uzski Corp is involved in a merger, acquisition or sale of assets, information may transfer as part of it, subject to this notice.",
    "We do not sell personal information and do not share it for cross-context behavioural advertising.",
  ] },
  { id: "cookies", title: "Cookies", body: [
    "Corral uses a small number of first-party cookies, all needed to run the site and app; there are no advertising cookies.",
    "wos_session keeps you signed in (HTTP-only, set by our API, up to 30 days). corral_return_to remembers the page to return to after sign-in (short-lived). corral_onboarded remembers that your workspace has finished onboarding. corral_visitor is set by the app when you're signed in and holds only your display name and profile picture address, so the marketing pages can show \"Open app\" instead of \"Sign in\"; it lasts up to 30 days, is removed when you sign out, and is never sent to third parties.",
    "Most browsers let you block or delete cookies; if you block these, you won't be able to stay signed in. We do not respond to Do-Not-Track signals because there is no agreed standard for them, but we don't track you across other sites. [TODO for Sean: confirm no analytics or error-tracking cookies are added before launch.]",
  ] },
  { id: "web", title: "Pages Corral reads, and data providers", body: [
    "Corral reads only public web pages: ones anyone can open without signing in. Its crawler identifies itself as CorralBot, respects robots.txt, does not follow private or local network addresses, and limits how much it reads from each site.",
    "Email addresses Corral finds are business addresses. Before a sequence writes to an address, Corral checks it can receive email (through ZeroBounce) and skips addresses that bounce or are on the workspace's suppression list.",
  ] },
  { id: "ai", title: "AI features", body: [
    "Corral uses AI models to score how well a company fits a product and explain why, to classify replies, and to draft messages and replies. Knowledge-base passages, company pages and the relevant email thread are sent to the model provider for that request. Drafts are suggestions: a person reviews them before they're sent. Scores and drafts can be wrong; each shows where its claims came from so they can be checked.",
    "AI providers process this data under contract only to return the result. [TODO for Sean: confirm each provider's retention period and that none train on our data.]",
  ] },
  { id: "retain", title: "How long we keep information", body: [
    "Account and workspace content: for as long as the workspace is active. When a customer removes a knowledge-base source it leaves search at once and can be restored for a short time; removed sources, files and their passages are then deleted. [TODO for Sean: set the restore window and the purge schedule for removed sources and files.]",
    "When a workspace is closed we delete its content, including prospect data, within [TODO for Sean: number] days, except what we must keep by law (such as billing records) and encrypted backups, which expire within [TODO for Sean: number] days.",
    "Suppression list entries (people who unsubscribed or asked not to be contacted) are kept for as long as the workspace exists, because deleting them would let the address be contacted again. We keep only what's needed to recognise the address.",
    "Server logs: [TODO for Sean: retention period].",
  ] },
  { id: "safe", title: "How we keep information safe", body: [
    "We use organisational and technical safeguards: encryption in transit (TLS) and of connection secrets at rest, workspace isolation enforced in the database with row-level security, least-privilege access for our staff, and an audit trail for API keys and MCP connections. The Security page has details. No system is 100% secure, so please use strong sign-in methods and tell us about anything suspicious.",
  ] },
  { id: "transfers", title: "International transfers", body: [
    "Uzski Corp is based in Kenya, and our service providers may process information in other countries, including the United States and the European Union. Where the law requires it, we use safeguards such as standard contractual clauses for these transfers. [TODO for Sean: confirm where production data is hosted.]",
  ] },
  { id: "minors", title: "Minors", body: [
    "Corral is a business service for people aged 18 and over. We do not knowingly collect information from children. If you believe we have, contact privacy@uzskicorp.agency and we will delete it.",
  ] },
  { id: "rights", title: "Your rights and choices", body: [
    "Depending on where you live, you may have the right to access, correct or delete your personal information, object to or restrict its processing, receive a copy in a portable format, withdraw consent, and complain to a data-protection authority. In Kenya that is the Office of the Data Protection Commissioner (odpc.go.ke); in South Africa, the Information Regulator (inforegulator.org.za).",
    "If you are a prospect: every Corral email has an unsubscribe link, and replying to ask not to be contacted works too. Either adds you to that customer's suppression list, so Corral stops writing to you for that customer. To find out what a customer holds about you, or to ask for deletion, contact the customer (the sender) or write to privacy@uzskicorp.agency and we will pass it on and help them respond.",
    "If you are a user: you can update your profile through your sign-in provider, and workspace owners can export or delete workspace data. To exercise any right, email privacy@uzskicorp.agency. We will respond within the time the law requires and may need to verify your identity. [TODO for Sean: confirm whether we keep the Termly DSAR form used on uzskicorp.agency or use email only.]",
  ] },
  { id: "updates", title: "Updates to this notice", body: [
    `We will update this notice when our practices change or the law requires. The date at the top shows the latest version (${LEGAL_UPDATED}); for material changes we will tell users by email before they take effect.`,
  ] },
  { id: "contact", title: "How to contact us", body: [
    `Email privacy@uzskicorp.agency, or write to Uzski Corp, ${ADDRESS}.`,
  ] },
];
