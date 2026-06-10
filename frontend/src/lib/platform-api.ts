export const PLATFORM_API = {
  dashboard: "/platform/dashboard",
  statistiques: "/platform/statistiques",
  plans: "/platform/plans",
  plan: (id: string) => `/platform/plans/${id}`,
  abonnements: "/platform/abonnements",
  abonnementRenouveler: (id: string) => `/platform/abonnements/${id}/renouveler`,
  abonnementChangerPlan: (id: string) => `/platform/abonnements/${id}/changer-plan`,
  abonnementResilier: (id: string) => `/platform/abonnements/${id}/resilier`,
  factures: "/platform/factures",
  facturesRevenus: "/platform/factures/revenus",
  facturePayer: (id: string) => `/platform/factures/${id}/payer`,
  notifications: "/platform/notifications",
  notificationsTous: "/platform/notifications/tous",
  notificationsTenant: (tenantId: string) =>
    `/platform/notifications/tenant/${tenantId}`,
  auditLogs: "/platform/audit-logs",
  tenants: "/platform/tenants",
  tenant: (id: string) => `/platform/tenants/${id}`,
  tenantUtilisateurs: (tenantId: string) =>
    `/platform/tenants/${tenantId}/utilisateurs`,
  tenantUtilisateur: (tenantId: string, userId: string) =>
    `/platform/tenants/${tenantId}/utilisateurs/${userId}`,
  tenantResetPassword: (tenantId: string, userId: string) =>
    `/platform/tenants/${tenantId}/utilisateurs/${userId}/reset-password`,
  tenantSuspendre: (id: string) => `/platform/tenants/${id}/suspendre`,
  tenantActiver: (id: string) => `/platform/tenants/${id}/activer`,
} as const;
