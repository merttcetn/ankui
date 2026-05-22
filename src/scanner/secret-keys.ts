/**
 * Heuristic check for whether a config key name looks like it holds a secret
 * (token, API key, password, credential, etc.).
 *
 * Pure string logic with no Node dependencies, so it is safe to import from a
 * browser bundle as well as from the scanner.
 */
export function isSecretLikeKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const compactKey = normalizedKey.replace(/_/g, "");

  return (
    normalizedKey === "auth" ||
    normalizedKey === "authorization" ||
    normalizedKey.includes("token") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("credential") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("passwd") ||
    compactKey.includes("apikey") ||
    compactKey.includes("privatekey") ||
    compactKey.includes("accesstoken") ||
    compactKey.includes("refreshtoken") ||
    compactKey.includes("authtoken") ||
    compactKey.includes("clientsecret")
  );
}
