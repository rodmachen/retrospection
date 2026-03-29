export function checkBearerToken(
  authHeader: string | null,
  apiKey: string
): boolean {
  if (!authHeader) return false;
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  return token === apiKey;
}
