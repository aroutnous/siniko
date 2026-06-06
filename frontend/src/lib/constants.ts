export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  eleves: "/eleves",
  elevesInscrire: "/eleves/inscrire",
  eleveDossier: "/eleves/:eleveId/dossier",
  financePaiements: "/finance/paiements",
  platformDashboard: "/platform",
  platformTenants: "/platform/tenants",
  platformTenantsCreate: "/platform/tenants/nouveau",
  platformPlans: "/platform/plans",
  platformAudit: "/platform/audit",
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
