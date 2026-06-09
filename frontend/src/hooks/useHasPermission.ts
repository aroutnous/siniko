import { useCallback } from "react";

import { useAuthStore } from "@/stores/authStore";

/**
 * Hook réactif aux changements de permissions (contrairement au sélecteur hasPermission seul).
 */
export function useHasPermission(): (permission: string) => boolean {
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);

  return useCallback(
    (permission: string) => {
      if (user?.role === "promoteur") return true;
      if (permissions.includes("*")) return true;
      return permissions.includes(permission);
    },
    [permissions, user?.role],
  );
}
