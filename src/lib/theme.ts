export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "site-theme-change";

export type Theme = "light" | "dark" | "system";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(
  root: HTMLElement,
  theme: Theme,
  systemDark: boolean,
) {
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.dataset.theme = theme;
}

export const themeScript = `
(function () {
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var parseTheme = ${parseTheme.toString()};
  var applyTheme = ${applyTheme.toString()};
  var stored;
  try { stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch {}
  applyTheme(root, parseTheme(stored), media.matches);
  media.addEventListener("change", function (event) {
    if (root.dataset.theme === "system") applyTheme(root, "system", event.matches);
  });
})();
`;
