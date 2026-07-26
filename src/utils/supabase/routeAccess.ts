export const PROTECTED_ROUTE_PREFIXES = [
  "/research",
  "/knowledge",
  "/x-viewer",
  "/visualizer",
  "/omni",
  "/dashboard",
  "/relocation",
  "/rentals",
  "/trends",
] as const;

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
}
