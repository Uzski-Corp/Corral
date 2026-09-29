import { LEADS } from "./data";
import { Avatar, FitBar, Tag, cx } from "./primitives";
import { Icon } from "./icons";

const PICK = ["kilima", "pwani", "savanna", "tamu", "nyota", "kivu"];

/** Close-up of scored rows with receipts. Wrap in .c-zoom-* for 2–5× editorial crops. */
export function RowDetail({ className, open = "kilima" }: { className?: string; open?: string }) {
  const rows = PICK.map((id) => LEADS.find((l) => l.id === id)!);
  return (
    <div className={cx("c-win c-win--flat c-detail", className)} aria-label="Corral app: close-up of scored rows">
      <div className="c-toolbar" style={{ height: 44 }}><div className="c-crumbs"><span>Segments</span><span className="c-sep">/</span><b>F&amp;B · East Africa</b></div></div>
      {rows.map((l) => (
        <div key={l.id} className={cx("c-drow", l.id === open && "is-selected", l.fit < 80 && "is-dim")}>
          <div className="c-drow__main">
            <Avatar id={l.avatar} size={28} />
            <div className="c-person__txt" style={{ width: 230 }}><span className="c-strong">{l.person}</span><span>{l.title} · {l.company.replace(" Co.", "")}</span></div>
            <FitBar value={l.fit} /><Tag status={l.reply} />
          </div>
          {l.id === open && <div className="c-drow__rc">{l.why.map((w) => <span key={w}><Icon name="check" size={12} />{w}</span>)}</div>}
        </div>
      ))}
    </div>
  );
}
