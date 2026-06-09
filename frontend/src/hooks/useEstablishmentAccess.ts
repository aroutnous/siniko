import { useHasPermission } from "@/hooks/useHasPermission";
import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface EstablishmentAccess {
  role: RoleUtilisateur;
  canRead: boolean;
  canManage: boolean;
  canEditConfig: boolean;
}

export function useEstablishmentAccess(): EstablishmentAccess {
  const role = useAuthStore((s) => s.user?.role ?? "secretaire");
  const hasPermission = useHasPermission();

  return {
    role,
    canRead: hasPermission("classes.read") || hasPermission("classes.write"),
    canManage: hasPermission("classes.write"),
    canEditConfig: hasPermission("classes.write"),
  };
}
