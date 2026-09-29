import { Icon, Mark, type IconName } from "./icons";
import { Kbd, cx } from "./primitives";

const NAV: [IconName, string, string?][] = [["search", "Search", "⌘K"], ["inbox", "Unibox", "12"], ["building", "Companies"], ["user", "Contacts"], ["seq", "Sequences"], ["box", "Products"]];
const SEGMENTS: [string, number][] = [["F&B · East Africa", 48], ["Logistics · Fit > 70", 31], ["Replied, no meeting", 7]];

export function Sidebar({ active = "F&B · East Africa", workspace = "ColdTrace" }: { active?: string; workspace?: string }) {
  return (
    <nav className="c-side" aria-label="App navigation">
      <div className="c-side__ws"><Mark size={16} />{workspace}</div>
      {NAV.map(([ic, t, r]) => (
        <div key={t} className={cx("c-nav", active === t && "is-active")}>
          <span className="c-nav__ic"><Icon name={ic} />{t}</span>
          {r && (t === "Search" ? <Kbd>{r}</Kbd> : <span className="c-count">{r}</span>)}
        </div>
      ))}
      <div className="c-side__label">Segments</div>
      {SEGMENTS.map(([s, n]) => (
        <div key={s} className={cx("c-nav", active === s && "is-active")}><span>{s}</span><span className="c-count">{n}</span></div>
      ))}
    </nav>
  );
}
