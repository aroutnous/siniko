export const FINANCE_API = {
  frais: "/finance/frais",
  paiements: "/finance/paiements",
  paiementValider: (id: string) => `/finance/paiements/${id}/valider`,
  impayes: "/finance/impayes",
  transactions: "/finance/transactions",
  depenses: "/finance/depenses",
  salaires: "/finance/salaires",
  caisse: "/finance/caisse",
  situation: "/finance/situation",
} as const;

export const REPORTING_FINANCE_API = {
  tableauBord: "/reporting/tableau-bord",
  exportRapportFinancier: "/reporting/exports/rapport-financier",
  impressionRecu: (id: string) => `/reporting/impressions/recu/${id}`,
} as const;
