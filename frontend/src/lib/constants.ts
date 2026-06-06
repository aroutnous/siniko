export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  eleves: "/eleves",
  elevesInscrire: "/eleves/inscrire",
  elevesAbsences: "/eleves/absences",
  eleveDossier: "/eleves/:eleveId/dossier",
  financePaiements: "/finance/paiements",
  financeFrais: "/finance/frais",
  financeImpayes: "/finance/impayes",
  financeTransactions: "/finance/transactions",
  financeDepenses: "/finance/depenses",
  financeSalaires: "/finance/salaires",
  financeCaisse: "/finance/caisse",
  financeTableauBord: "/finance/tableau-bord",
  platformDashboard: "/platform",
  platformTenants: "/platform/tenants",
  platformTenantsCreate: "/platform/tenants/nouveau",
  platformPlans: "/platform/plans",
  platformAudit: "/platform/audit",
  etablissementAnnees: "/etablissement/annees",
  etablissementPeriodes: "/etablissement/periodes",
  etablissementCycles: "/etablissement/cycles",
  etablissementNiveaux: "/etablissement/niveaux",
  etablissementClasses: "/etablissement/classes",
  etablissementMatieres: "/etablissement/matieres",
  etablissementConfigNotation: "/etablissement/config-notation",
  pedagogieNotes: "/pedagogie/notes",
  pedagogieBulletins: "/pedagogie/bulletins",
  pedagogieResultats: "/pedagogie/resultats",
  pedagogieHistorique: "/pedagogie/historique",
  reportingTableauBord: "/reporting/tableau-bord",
  reportingStatistiques: "/reporting/statistiques",
  reportingExports: "/reporting/exports",
  reportingImpressions: "/reporting/impressions",
  utilisateurs: "/utilisateurs",
  profil: "/profil",
} as const;

export const SESSION_KEYS = {
  token: "siniko_access_token",
  tenantSlug: "siniko_tenant_slug",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  platform_owner: "Administrateur plateforme",
  promoteur: "Promoteur",
  directeur: "Directeur",
  secretaire: "Secrétaire",
  comptable: "Comptable",
};
