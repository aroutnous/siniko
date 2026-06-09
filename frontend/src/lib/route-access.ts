import type { MenuAccess } from "@/hooks/useMenuAccess";
import { ROUTES } from "@/lib/constants";

export function canAccessPath(
  pathname: string,
  menuAccess: MenuAccess,
  hasPermission: (permission: string) => boolean,
): boolean {
  if (
    pathname === ROUTES.dashboard ||
    pathname === ROUTES.profil ||
    pathname === "/"
  ) {
    return true;
  }

  if (pathname.startsWith("/etablissement")) {
    return menuAccess.showEtablissement;
  }

  if (pathname === ROUTES.elevesInscrire) {
    return hasPermission("eleves.write");
  }

  if (pathname === ROUTES.elevesAbsences) {
    return menuAccess.showAbsences;
  }

  if (pathname.startsWith("/eleves")) {
    return menuAccess.showEleves;
  }

  if (pathname.startsWith("/pedagogie")) {
    return menuAccess.showPedagogie;
  }

  if (pathname.startsWith("/finance")) {
    return menuAccess.showFinance;
  }

  if (pathname.startsWith("/reporting")) {
    return menuAccess.showReporting;
  }

  if (pathname === ROUTES.utilisateurs) {
    return menuAccess.showUtilisateurs;
  }

  return true;
}
