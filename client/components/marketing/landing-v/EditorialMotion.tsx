"use client";

import { useEffect } from "react";

/** Only off-screen sections wait for entry. Server HTML stays readable without JS. */
export function EditorialMotion() {
  useEffect(() => {
    const root = document.getElementById("editorial-landing");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!root || reduced.matches || !("IntersectionObserver" in window)) return;
    const sections = [...root.querySelectorAll<HTMLElement>("[data-editorial-reveal]")];
    const show = (element: HTMLElement) => element.removeAttribute("data-motion-pending");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: "0px 0px -48px 0px" });
    for (const section of sections) {
      if (section.getBoundingClientRect().top < window.innerHeight) continue;
      section.setAttribute("data-motion-pending", "");
      observer.observe(section);
    }
    const revealAll = () => {
      if (!reduced.matches) return;
      observer.disconnect();
      sections.forEach(show);
    };
    const revealFocused = (event: FocusEvent) => {
      const section = (event.target as Element).closest<HTMLElement>("[data-editorial-reveal]");
      if (section) { show(section); observer.unobserve(section); }
    };
    reduced.addEventListener("change", revealAll);
    root.addEventListener("focusin", revealFocused);
    return () => {
      observer.disconnect();
      sections.forEach(show);
      reduced.removeEventListener("change", revealAll);
      root.removeEventListener("focusin", revealFocused);
    };
  }, []);
  return null;
}
