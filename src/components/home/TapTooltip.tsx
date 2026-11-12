"use client";

import { useId, useState, type ReactNode } from "react";

export function TapTooltip({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="group/tooltip relative inline-block" data-open={open}>
      <button
        type="button"
        className={className}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {label}
      </button>
      <div
        id={id}
        role="tooltip"
        className={`${open ? "block" : "hidden [@media(hover:hover)]:group-hover/tooltip:block"} absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-stone-50 border border-stone-300 text-stone-600 text-xs shadow-2xl z-50 rounded-xl font-sans normal-case leading-relaxed`}
      >
        {children}
      </div>
    </div>
  );
}
