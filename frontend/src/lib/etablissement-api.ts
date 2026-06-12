export const ETABLISSEMENT_API = {
  annees: "/annees-scolaires",
  anneeActive: "/annees-scolaires/active",
  periodes: "/periodes",
  cycles: "/cycles",
  /** Niveaux scolaires (ex-niveaux). */
  classesNiveau: "/classes",
  /** Alias legacy. */
  niveaux: "/niveaux",
  /** Divisions physiques (ex-classes). */
  salles: "/salles",
  /** @deprecated Alias legacy — utiliser `salles`. */
  classes: "/salles",
  /** Alias legacy divisions physiques. */
  classesLegacy: "/divisions",
  matieres: "/matieres",
  structure: "/etablissement/structure",
  wizard: "/wizard",
  valeursCycles: "/valeurs/cycles",
  valeursClasses: "/valeurs/classes",
  valeursPeriodes: "/valeurs/periodes",
  valeursAnnees: "/valeurs/annees-scolaires",
} as const;
