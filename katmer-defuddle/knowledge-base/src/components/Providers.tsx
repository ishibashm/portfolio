"use client";

// NextAuth is currently bypassed for local deployment.
// Using SessionProvider causes unnecessary 404 polling errors when basePath is active.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
