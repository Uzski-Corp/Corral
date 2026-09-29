const P: Record<string, string> = {
  search: "M6.5 2.25a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5ZM9.8 9.8l2.7 2.7",
  inbox: "M2 8.5h3l1 2h3l1-2h3M3.3 3h7.4L13 8.5V12H1V8.5z",
  building: "M2.5 12.5V2.5h6v10M8.5 6h3v6.5M1.5 12.5h11M4.5 5h2M4.5 7.5h2M4.5 10h2",
  user: "M7 2.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8ZM2.5 12.3c.6-2.3 2.4-3.6 4.5-3.6s3.9 1.3 4.5 3.6",
  seq: "M2 3.5h10M2 7h7M2 10.5h4",
  box: "M1.8 4.2 7 1.8l5.2 2.4v5.6L7 12.2 1.8 9.8zM1.8 4.2 7 6.6l5.2-2.4M7 6.6v5.6",
  check: "M2.9 7.2 5.8 9.9 11.1 4.1",
  plus: "M7 2.5v9M2.5 7h9",
  chev: "M5 3.5 8.5 7 5 10.5",
  down: "M3.5 5.5 7 9l3.5-3.5",
  link: "M6 8a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 8 2.5l-.8.8M8 6a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 6 11.5l.8-.8",
  cal: "M3.4 2.8h7.2a1.6 1.6 0 0 1 1.6 1.6v6.2a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6V4.4a1.6 1.6 0 0 1 1.6-1.6ZM1.8 5.8h10.4M4.5 1.5v2.5M9.5 1.5v2.5",
  arrow: "M2.5 7h9M8 3.5 11.5 7 8 10.5",
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

/** The Corral mark: an open ring (a gate left open) around a dot. */
export function Mark({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <path d="M18.5 6.2 A8.6 8.6 0 1 0 19.6 12" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="11" cy="11" r="2.6" fill={color} />
    </svg>
  );
}
