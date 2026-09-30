"use client";
import { usePathname } from "next/navigation";

/** The address the 404 "read", shortened past 48 characters. */
export function CurrentPath() {
  const path = usePathname() ?? "/";
  return <span className="c-mono">{path.length > 48 ? `${path.slice(0, 47)}…` : path}</span>;
}
