/** Libellés des statuts de compétence (cycle qualitatif). */

export const STATUT_COMPETENCE_OPTIONS = [
  { value: "acquis", label: "Acquis" },
  { value: "en_cours_acquisition", label: "En cours d'acquisition" },
  { value: "non_acquis", label: "Non acquis" },
] as const;

export type StatutCompetence = (typeof STATUT_COMPETENCE_OPTIONS)[number]["value"];

const STATUT_COMPETENCE_LABELS: Record<string, string> = Object.fromEntries(
  STATUT_COMPETENCE_OPTIONS.map((o) => [o.value, o.label]),
);

export function formatStatutCompetence(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUT_COMPETENCE_LABELS[value] ?? value;
}

export function statutCompetenceBadgeVariant(
  value: string | null | undefined,
): "success" | "warning" | "destructive" | "muted" {
  switch (value) {
    case "acquis":
      return "success";
    case "en_cours_acquisition":
      return "warning";
    case "non_acquis":
      return "destructive";
    default:
      return "muted";
  }
}

/** Nom du cycle fondamental utilisant les séquences (compositions mensuelles). */
export const CYCLE_1ER = "1er Cycle";

export function usesSequenceForCycle(
  cycle: { type_evaluation: string; nom: string } | null | undefined,
): boolean {
  return cycle?.type_evaluation === "chiffree" && cycle.nom === CYCLE_1ER;
}

export function usesPeriodeForCycle(
  cycle: { type_evaluation: string; nom: string } | null | undefined,
): boolean {
  if (!cycle) return false;
  if (cycle.type_evaluation === "qualitative") return true;
  return !usesSequenceForCycle(cycle);
}

/** Valide une note chiffrée : 0 à noteMax, 2 décimales max. */
export function isValidNoteChiffree(value: string, noteMax: number): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return false;
  }
  const n = Number(value);
  return !Number.isNaN(n) && n >= 0 && n <= noteMax;
}

/** Formate une note ou moyenne (l'API peut renvoyer des Decimal en string). */
export function formatDecimal(
  value: number | string | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) {
    return "—";
  }
  return n.toFixed(decimals);
}

export function parseCycleNotationFromValeur(
  meta: Record<string, string | number | null | boolean> | undefined,
): {
  type_evaluation: "chiffree" | "qualitative";
  note_max: string;
  note_passage: string;
  arrondi: string;
} {
  const type = meta?.type_evaluation === "qualitative" ? "qualitative" : "chiffree";
  if (type === "qualitative") {
    return {
      type_evaluation: "qualitative",
      note_max: "",
      note_passage: "",
      arrondi: "",
    };
  }
  return {
    type_evaluation: "chiffree",
    note_max: String(meta?.note_max ?? 20),
    note_passage: String(meta?.note_passage ?? 10),
    arrondi: String(meta?.arrondi ?? 2),
  };
}
