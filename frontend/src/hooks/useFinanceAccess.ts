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

  const isPromoteur = role === "promoteur";
  const isComptable = role === "comptable";
  const isSecretaire = role === "secretaire";
  const isDirecteur = role === "directeur";

  return {
    role,
    canAccessPaiements: isSecretaire || isComptable || isPromoteur,
    canRegisterPaiements: isSecretaire || isComptable || isPromoteur,
    canValidatePaiements: isComptable || isPromoteur,
    canAccessFrais: isDirecteur || isPromoteur,
    canManageFrais: isDirecteur || isPromoteur,
    canAccessImpayes: isComptable || isPromoteur,
    canAccessTransactions: isComptable || isPromoteur,
    canAccessDepenses: isComptable || isPromoteur,
    canManageDepenses: isComptable || isPromoteur,
    canAccessSalaires: isComptable || isPromoteur,
    canManageSalaires: isComptable || isPromoteur,
    canAccessCaisse: isComptable || isPromoteur,
    canAccessTableauBord: isComptable || isPromoteur,
  };
}
