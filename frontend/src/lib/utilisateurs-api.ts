export const UTILISATEURS_API = {
  list: "/auth/utilisateurs",
  create: "/auth/utilisateurs",
  statut: (id: string) => `/auth/utilisateurs/${id}/statut`,
  changePassword: "/auth/change-password",
  me: "/auth/me",
} as const;

export const ROLES_CREATABLE: Array<"directeur" | "secretaire" | "comptable"> = [
  "directeur",
  "secretaire",
  "comptable",
];
