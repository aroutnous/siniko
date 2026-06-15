export const PEDAGOGIE_API = {
  notesBatch: "/pedagogie/notes/batch",
  notesHistorique: (eleveId: string) => `/pedagogie/notes/${eleveId}`,
  bulletinsEleve: (eleveId: string) => `/pedagogie/eleves/${eleveId}/bulletins`,
  bulletinsGenerer: "/pedagogie/bulletins/generer",
  bulletin: (id: string) => `/pedagogie/bulletins/${id}`,
  bulletinValider: (id: string) => `/pedagogie/bulletins/${id}/valider`,
  bulletinPublier: (id: string) => `/pedagogie/bulletins/${id}/publier`,
  resultatsClasse: (classeId: string) => `/pedagogie/classes/${classeId}/resultats`,
} as const;

export const REPORTING_API = {
  exportResultatsClasse: "/reporting/exports/resultats-classe",
  impressionBulletin: (id: string) => `/reporting/impressions/bulletin/${id}`,
} as const;
