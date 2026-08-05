export function canUseAgentAdminTools(
  userEmail: string | null | undefined,
  adminEmail: string,
): boolean {
  return Boolean(userEmail && userEmail === adminEmail);
}
