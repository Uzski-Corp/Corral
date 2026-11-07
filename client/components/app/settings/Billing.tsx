"use client";
/* Settings → Billing review states. Live billing is BillingConnected.
   Monthly USD is confirmed: Field $49, Range $149. Territory stays contact-sales.
   Yearly prices are not confirmed, so this screen does not offer a year. */
import { ChatCircle, CreditCard } from "@phosphor-icons/react/dist/ssr";
import { Button, cx } from "../primitives";
import { EmptyState, Skeleton } from "../States";
import { PLANS, priceWords, type PlanId } from "@/lib/marketing/plans";

export const BILLING_COPY = {
  title: "Billing", noPlan: "No plan yet", noPlanLine: "A 7-day trial starts when the workspace is ready. No card.",
  perMonth: "a month", choose: "Choose", talk: "Talk to us", contact: "Not sure? Write to us and we’ll help you pick.",
} as const;
const SALES = "mailto:hello@corral.so?subject=Picking%20a%20Corral%20plan"; // OPEN QUESTION: confirm the sales address

export function BillingView({ load, onChoose }: { load?: "loading"; onChoose?: (plan: PlanId) => void }) {
  if (load === "loading") return (
    <div className="i-page b-page" aria-busy="true"><div className="i-head"><h2>{BILLING_COPY.title}</h2></div>
      <span className="u-sr" role="status">Loading billing</span>
      <div className="b-hero" aria-hidden="true"><Skeleton w={104} h={60} r={12} /><Skeleton w={120} h={14} /><Skeleton w={200} /></div>
      <ul className="b-plans" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="b-plan"><span className="b-plan__txt"><Skeleton w={72} /><Skeleton w={220} h={8} /></span><Skeleton w={64} /><Skeleton w={72} h={28} r={8} /></li>)}</ul>
    </div>
  );
  return (
    <div className="i-page b-page">
      <div className="i-head"><h2>{BILLING_COPY.title}</h2></div>
      <div className="b-hero"><EmptyState id="billing" glyph={CreditCard} title={BILLING_COPY.noPlan}>{BILLING_COPY.noPlanLine}</EmptyState></div>
      <ul className="b-plans" aria-label="Plans">
        {PLANS.map((p) => (
          <li key={p.id} className={cx("b-plan", p.primary && "is-primary")}>
            <span className="b-plan__txt"><span className="b-plan__name">{p.name}<span className="b-plan__tag">{p.tag}</span></span><span className="b-plan__line">{p.line}</span></span>
            {p.price === null
              ? <><span className="b-plan__price" /><a className="c-btn c-btn--quiet" href={SALES}><ChatCircle size={14} />{BILLING_COPY.talk}</a></>
              : <><span className="b-plan__price"><span className="c-mono">{priceWords(p)}</span><span className="b-plan__per">{BILLING_COPY.perMonth}</span></span>
                <Button variant={p.primary ? "primary" : "default"} onClick={() => onChoose?.(p.id)}>{BILLING_COPY.choose}</Button></>}
          </li>
        ))}
      </ul>
      <p className="b-foot c-faint">{BILLING_COPY.contact.split("Write to us")[0]}<a href={SALES}>Write to us</a>{BILLING_COPY.contact.split("Write to us")[1]}</p>
    </div>
  );
}
