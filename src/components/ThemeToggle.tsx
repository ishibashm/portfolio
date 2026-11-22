"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  applyTheme,
  parseTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

const choices = {
  light: { label: "ライト", icon: Sun, next: "dark" },
  dark: { label: "ダーク", icon: Moon, next: "system" },
  system: { label: "自動", icon: Monitor, next: "light" },
} as const;

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

function getTheme() {
  return parseTheme(document.documentElement.dataset.theme);
}

function getServerTheme(): Theme {
  return "system";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const { label, icon: Icon, next } = choices[theme];
  const name = `表示テーマ: ${label}（押すと${choices[next].label}）`;

  function cycleTheme() {
    const preference = choices[getTheme()].next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // 保存が制限されていても、このページの表示は切り替えられる。
    }
    applyTheme(
      document.documentElement,
      preference,
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={cycleTheme}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-theme-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
