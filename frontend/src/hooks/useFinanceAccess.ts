import { useHasPermission } from "@/hooks/useHasPermission";
import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface FinanceAccess {
  role: RoleUtilisateur;
  canAccessPaiements: boolean;
  canRegisterPaiements: boolean;
  canValidatePaiements: boolean;
  canAccessFrais: boolean;
  canManageFrais: boolean;
  canAccessImpayes: boolean;
  canAccessTransactions: boolean;
  canAccessDepenses: boolean;
  canManageDepenses: boolean;
  canAccessSalaires: boolean;
  canManageSalaires: boolean;
  canAccessCaisse: boolean;
  canAccessTableauBord: boolean;
}

export function useFinanceAccess(): FinanceAccess {
  const role = useAuthStore((s) => s.user?.role ?? "secretaire");
  const hasPermission = useHasPermission();

  return {
    role,
    canAccessPaiements: hasPermission("paiements.read") || hasPermission("paiements.write"),
    canRegisterPaiements: hasPermission("paiements.write"),
    canValidatePaiements: hasPermission("paiements.validate"),
    canAccessFrais: hasPermission("frais.read") || hasPermission("frais.write"),
    canManageFrais: hasPermission("frais.write"),
    canAccessImpayes: hasPermission("paiements.read"),
    canAccessTransactions: hasPermission("paiements.read"),
    canAccessDepenses: hasPermission("depenses.read") || hasPermission("depenses.write"),
    canManageDepenses: hasPermission("depenses.write"),
    canAccessSalaires: hasPermission("salaires.read") || hasPermission("salaires.write"),
    canManageSalaires: hasPermission("salaires.write"),
    canAccessCaisse: hasPermission("paiements.read"),
    canAccessTableauBord:
      hasPermission("paiements.read") ||
      hasPermission("depenses.read") ||
      hasPermission("statistiques.read"),
  };
}
