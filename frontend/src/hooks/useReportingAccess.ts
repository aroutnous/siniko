import { useHasPermission } from "@/hooks/useHasPermission";
import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface ReportingAccess {
  role: RoleUtilisateur;
  canAccessTableauBord: boolean;
  canAccessStatistiques: boolean;
  canAccessExports: boolean;
  canAccessImpressions: boolean;
}

export function useReportingAccess(): ReportingAccess {
  const role = useAuthStore((s) => s.user?.role ?? "secretaire");
  const hasPermission = useHasPermission();

  return {
    role,
    canAccessTableauBord:
      hasPermission("rapports.read") || hasPermission("statistiques.read"),
    canAccessStatistiques: hasPermission("statistiques.read"),
    canAccessExports: hasPermission("rapports.read"),
    canAccessImpressions:
      hasPermission("rapports.imprimer") || hasPermission("rapports.read"),
  };
}
