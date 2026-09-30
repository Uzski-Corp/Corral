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
  users: "M5.2 2.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM1.5 11.6c.5-2 1.9-3.1 3.7-3.1s3.2 1.1 3.7 3.1M9.4 2.8a2 2 0 0 1 0 3.9M10.6 8.7c1 .4 1.7 1.3 2 2.9",
  layers: "M7 1.8 12.4 4.6 7 7.4 1.6 4.6zM1.6 7.2 7 10l5.4-2.8M1.6 9.8 7 12.6l5.4-2.8",
  book: "M2 2.6h3.4A1.6 1.6 0 0 1 7 4.2v8a1.4 1.4 0 0 0-1.4-1.3H2zM12 2.6H8.6A1.6 1.6 0 0 0 7 4.2v8a1.4 1.4 0 0 1 1.4-1.3H12z",
  gear: "M7 5.1a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8ZM7 1.2v1.6M7 11.2v1.6M12.8 7h-1.6M2.8 7H1.2M11.1 2.9 10 4M4 10l-1.1 1.1M11.1 11.1 10 10M4 4 2.9 2.9",
  panel: "M2.8 2h8.4A1.3 1.3 0 0 1 12.5 3.3v7.4A1.3 1.3 0 0 1 11.2 12H2.8a1.3 1.3 0 0 1-1.3-1.3V3.3A1.3 1.3 0 0 1 2.8 2ZM5.2 2v10",
  menu: "M2 3.8h10M2 7h10M2 10.2h10",
  bell: "M3.4 9.6V6.2a3.6 3.6 0 0 1 7.2 0v3.4l1 1.3H2.4zM5.6 12.2h2.8",
  x: "M3.5 3.5l7 7M10.5 3.5l-7 7",
  more: "M3 7h.01M7 7h.01M11 7h.01",
  mail: "M2.6 3h8.8A1.1 1.1 0 0 1 12.5 4.1v5.8A1.1 1.1 0 0 1 11.4 11H2.6a1.1 1.1 0 0 1-1.1-1.1V4.1A1.1 1.1 0 0 1 2.6 3ZM1.8 3.8 7 7.6l5.2-3.8",
  alert: "M7 1.8 12.8 11.8H1.2zM7 5.6v2.8M7 10.1v.01",
  clock: "M7 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 7 1.6ZM7 4v3.2l2 1.2",
  globe: "M7 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 7 1.6ZM1.6 7h10.8M7 1.6c1.5 1.5 2.2 3.3 2.2 5.4S8.5 10.9 7 12.4C5.5 10.9 4.8 9.1 4.8 7S5.5 3.1 7 1.6Z",
  send: "M12.4 1.6 6.2 7.8M12.4 1.6 8.6 12.4 6.2 7.8 1.6 5.4z",
  archive: "M1.8 2.6h10.4v2.6H1.8zM2.8 5.2v6.2h8.4V5.2M5.6 7.6h2.8",
  back: "M9 3.5 5.5 7 9 10.5",
  up: "M3.5 8.5 7 5l3.5 3.5",
  help: "M7 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 7 1.6ZM5.4 5.5a1.7 1.7 0 0 1 3.3.5c0 1.1-1.7 1.4-1.7 2.4M7 10.1v.01",
  logout: "M5.5 12H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2.5M9 4.2 11.8 7 9 9.8M11.8 7H5.5",
  refresh: "M11.8 5.6A5 5 0 0 0 2.6 4.4M2.2 8.4a5 5 0 0 0 9.2 1.2M2.4 1.8v2.8h2.8M11.6 12.2V9.4H8.8",
  filter: "M1.8 2.8h10.4L8.4 7.3v4L5.6 12.2V7.3z",
  upload: "M7 9.6V2.2M4.2 4.8 7 2.2l2.8 2.6M2 9.4v1.6A1 1 0 0 0 3 12h8a1 1 0 0 0 1-1V9.4",
  bolt: "M7.8 1.4 2.8 8h4l-.6 4.6L11.2 6h-4z",
  sort: "M4.5 2.5v9M2.5 9.5l2 2 2-2M9.5 11.5v-9M7.5 4.5l2-2 2 2",
  pen: "M9.2 2.3a1.3 1.3 0 0 1 1.9 0l.6.6a1.3 1.3 0 0 1 0 1.9L5 11.5l-2.8.6.6-2.8zM8.2 3.3l2.5 2.5",
  arrow: "M2.5 7h9M8 3.5 11.5 7 8 10.5",
  copy: "M4.8 4.8h6a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V5.8a1 1 0 0 1 1-1ZM9.2 4.8V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v5.2a1 1 0 0 0 1 1h.8",
  key: "M4.6 6.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2ZM6.6 7.4 11.8 2.2M9.6 4.4l1.6 1.6M11 3l1.4 1.4",
  plug: "M5 1.8v2.6M9 1.8v2.6M3.4 4.4h7.2v2.2a3.6 3.6 0 0 1-7.2 0zM7 10.2v2",
  code: "M4.8 3.8 1.8 7l3 3.2M9.2 3.8l3 3.2-3 3.2M8 2.4 6 11.6",
  eye: "M1.4 7s2-4 5.6-4 5.6 4 5.6 4-2 4-5.6 4-5.6-4-5.6-4ZM7 5.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z",
  lock: "M3.4 6.2h7.2a.9.9 0 0 1 .9.9v4.5a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9V7.1a.9.9 0 0 1 .9-.9ZM4.6 6.2V4.4a2.4 2.4 0 0 1 4.8 0v1.8",
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

/** Google "G" (brand colours, used only on the Google sign-in / connect buttons). */
export function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
/** Microsoft four-square (brand colours, only on the Microsoft 365 connect button). */
export function MicrosoftMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path fill="#F25022" d="M0 0h6.6v6.6H0z" /><path fill="#7FBA00" d="M7.4 0H14v6.6H7.4z" />
      <path fill="#00A4EF" d="M0 7.4h6.6V14H0z" /><path fill="#FFB900" d="M7.4 7.4H14V14H7.4z" />
    </svg>
  );
}
