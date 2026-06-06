import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface UtilisateursAccess {
  role: RoleUtilisateur;
  canManageUsers: boolean;
}

export function useUtilisateursAccess(): UtilisateursAccess {
  const role = useAuthStore((s) => s.user?.role ?? "secretaire");

  return {
    role,
    canManageUsers: role === "promoteur",
  };
}
