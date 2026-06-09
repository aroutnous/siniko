import { useHasPermission } from "@/hooks/useHasPermission";
import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface ElevesAccess {
  role: RoleUtilisateur;
  canRead: boolean;
  canManage: boolean;
  canManageAbsences: boolean;
  canDelete: boolean;
  canPrint: boolean;
}

export function useElevesAccess(): ElevesAccess {
  const role = useAuthStore((s) => s.user?.role ?? "secretaire");
  const hasPermission = useHasPermission();

  return {
    role,
    canRead: hasPermission("eleves.read"),
    canManage: hasPermission("eleves.write"),
    canManageAbsences:
      hasPermission("absences.read") || hasPermission("absences.write"),
    canDelete: hasPermission("eleves.delete"),
    canPrint: hasPermission("eleves.imprimer"),
  };
}
