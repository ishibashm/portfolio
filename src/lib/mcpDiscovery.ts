import { z } from "zod";
import {
  MCP_PERSONAL_RESOURCE,
  MCP_PROFILE_SCOPE,
} from "@/lib/mcpAuthorizationConfig";

// Intended same-origin AS placement. Not advertised by any enabled route yet.
export const MCP_AUTHORIZATION_ISSUER = "https://cloud-palette.com/oauth";
export const MCP_RESOURCE_METADATA_URL =
  "https://cloud-palette.com/.well-known/oauth-protected-resource/api/mcp/personal";
export const MCP_AS_METADATA_URL = `${MCP_AUTHORIZATION_ISSUER}/.well-known/openid-configuration`;

const asMetadataSchema = z.object({
  issuer: z.literal(MCP_AUTHORIZATION_ISSUER),
  authorization_endpoint: z.literal(`${MCP_AUTHORIZATION_ISSUER}/auth`),
  token_endpoint: z.literal(`${MCP_AUTHORIZATION_ISSUER}/token`),
  revocation_endpoint: z.literal(
    `${MCP_AUTHORIZATION_ISSUER}/token/revocation`,
  ),
  scopes_supported: z
    .array(z.string())
    .refine((scopes) => scopes.includes(MCP_PROFILE_SCOPE)),
  response_types_supported: z.tuple([z.literal("code")]),
  code_challenge_methods_supported: z.tuple([z.literal("S256")]),
  grant_types_supported: z
    .array(z.string())
    .refine(
      (grants) =>
        grants.includes("authorization_code") &&
        grants.includes("refresh_token"),
    ),
  registration_endpoint: z.undefined().optional(),
  client_id_metadata_document_supported: z.literal(false).optional(),
});

/**
 * Validate the actual local provider's discovery before composing RS metadata.
 * This is an internal deployment contract, never metadata supplied by a client.
 * AS discovery stays owned by oidc-provider's Node handler under /oauth; do not
 * duplicate its dynamic metadata in a Next Web Request route or a static JSON.
 */
export function createMcpDiscoveryContract(
  authorizationServerMetadata: unknown,
) {
  if (!asMetadataSchema.safeParse(authorizationServerMetadata).success)
    throw new Error("MCP_DISCOVERY_CONFIGURATION_MISMATCH");
  const resourceMetadata = {
    resource: MCP_PERSONAL_RESOURCE,
    authorization_servers: [MCP_AUTHORIZATION_ISSUER],
    scopes_supported: [MCP_PROFILE_SCOPE],
    bearer_methods_supported: ["header"],
  };
  return {
    resourceMetadataResponse: () =>
      Response.json(resourceMetadata, {
        headers: { "Cache-Control": "private, no-store" },
      }),
    unauthorizedResponse: (error?: "invalid_token" | "insufficient_scope") => {
      // Constant-only challenge; no Host, forwarded headers, request URLs or errors.
      const challenge = `Bearer resource_metadata="${MCP_RESOURCE_METADATA_URL}", scope="${MCP_PROFILE_SCOPE}"${error ? `, error="${error}"` : ""}`;
      return Response.json(
        { error: error ?? "unauthorized" },
        {
          status: error === "insufficient_scope" ? 403 : 401,
          headers: {
            "Cache-Control": "private, no-store",
            "WWW-Authenticate": challenge,
          },
        },
      );
    },
  };
}

/** Hard release gate: no env toggle can expose an unfinished personal flow. */
export function personalMcpUnavailableResponse() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
