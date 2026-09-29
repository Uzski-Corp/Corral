"use client";
import { useState } from "react";
import { Chip, cx } from "./primitives";
import { Icon } from "./icons";

const OPTIONS = ["Fit for ColdTrace Sensors", "Country", "Company size", "Reply status", "Email status"];

/** Filter bar: applied filters as chips, “+ Filter” opens a keyboard-first menu. */
export function FilterBar({ defaultOpen = false, menuLeft = 470 }: { defaultOpen?: boolean; menuLeft?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="c-filters">
      <Chip><i>Fit for</i><b>ColdTrace Sensors</b><i>&gt; 80</i></Chip>
      <Chip>Decision-maker verified</Chip><Chip>Kenya, Uganda, Tanzania</Chip>
      <Chip add open={open} onClick={() => setOpen((o) => !o)}>Filter</Chip>
      {open && (
        <div className="c-menu" style={{ left: menuLeft, top: 38 }} role="menu">
          <div className="c-menu__search"><Icon name="search" size={12} /><span>Filter by…</span></div>
          {OPTIONS.map((o, i) => <div key={o} role="menuitem" className={cx("c-menu__item", i === 1 && "is-hover")}>{o}{i === 1 && <span className="c-kbd">↵</span>}</div>)}
          <div className="c-menu__sep" /><div className="c-menu__item"><Icon name="plus" size={12} />Save as segment<span className="c-kbd">S</span></div>
        </div>
      )}
    </div>
  );
}
