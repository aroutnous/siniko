/** Normalise la liste permissions renvoyée par l'API (strings ou objets). */
export function normalizePermissionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item !== null && typeof item === "object" && "permission" in item) {
        const permission = (item as { permission: unknown }).permission;
        return typeof permission === "string" ? permission : "";
      }
      return "";
    })
    .filter((permission) => permission.length > 0);
}
