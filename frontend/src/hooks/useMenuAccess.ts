import { useAuthStore } from "@/stores/authStore";

export interface MenuAccess {
  showEtablissement: boolean;
  showEleves: boolean;
  showAbsences: boolean;
  showPedagogie: boolean;
  showFinance: boolean;
  showReporting: boolean;
  showUtilisateurs: boolean;
}

function checkPermission(
  userRole: string | undefined,
  permissions: string[],
  permission: string,
): boolean {
  if (userRole === "promoteur") return true;
  if (permissions.includes("*")) return true;
  return permissions.includes(permission);
}

export function useMenuAccess(): MenuAccess {
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const role = user?.role;
  const isPromoteur = role === "promoteur";

  const has = (permission: string): boolean =>
    checkPermission(role, permissions, permission);

  return {
    showEtablissement:
      isPromoteur || has("classes.read") || has("classes.write"),
    showEleves: isPromoteur || has("eleves.read") || has("eleves.write"),
    showAbsences:
      isPromoteur || has("absences.read") || has("absences.write"),
    showPedagogie:
      isPromoteur ||
      has("notes.read") ||
      has("notes.write") ||
      has("bulletins.read") ||
      has("bulletins.validate"),
    showFinance:
      isPromoteur ||
      has("paiements.read") ||
      has("paiements.write") ||
      has("frais.read") ||
      has("salaires.read") ||
      has("depenses.read"),
    showReporting:
      isPromoteur || has("rapports.read") || has("statistiques.read"),
    showUtilisateurs: isPromoteur,
  };
}
