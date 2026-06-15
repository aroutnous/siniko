export const ELEVES_API = {
  list: "/eleves/",
  inscrire: "/eleves/inscrire",
  detail: (id: string) => `/eleves/${id}`,
  dossier: (id: string) => `/eleves/${id}/dossier`,
  archiver: (id: string) => `/eleves/${id}/archiver`,
  transferer: (id: string) => `/eleves/${id}/transferer`,
  absences: (id: string) => `/eleves/${id}/absences`,
  absencesClasse: (classeId: string) => `/eleves/classes/${classeId}/absences`,
  justifierAbsence: (id: string) => `/eleves/absences/${id}/justifier`,
  carteScolaire: (id: string) => `/eleves/${id}/carte-scolaire`,
  attestation: (id: string) => `/eleves/${id}/attestation`,
  certificat: (id: string) => `/eleves/${id}/certificat`,
} as const;
