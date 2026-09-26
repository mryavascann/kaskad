"use client";

import { useEffect } from "react";

export function RevealSections() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.animate([{ transform: "translateY(12px)", opacity: .65 }, { transform: "translateY(0)", opacity: 1 }], { duration: 450, easing: "ease-out" });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .05 });
    document.querySelectorAll(".protocol-stack > section").forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return null;
}
