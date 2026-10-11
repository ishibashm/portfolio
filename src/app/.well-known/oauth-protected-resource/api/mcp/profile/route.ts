import { PROFILE_RESOURCE, profileOAuthIssuer } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const issuer = profileOAuthIssuer();
  if (!issuer)
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  return Response.json(
    {
      resource: PROFILE_RESOURCE,
      authorization_servers: [issuer],
      scopes_supported: ["profiles:read"],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
