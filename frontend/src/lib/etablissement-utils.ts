import type { ClasseNiveau, Cycle, Salle } from "@/types";

export function displayCycleLabel(nom: string): string {
  if (nom === "Jardins d enfants") return "Jardins d'enfants";
  if (nom === "2eme Cycle") return "2ème Cycle";
  return nom;
}

export function formatBool(value: boolean): string {
  return value ? "Oui" : "Non";
}

export type SalleLabelInput = {
  nom: string;
  nom_salle?: string | null;
};
export type ClasseLabelInput = Pick<ClasseNiveau, "nom"> | string | null | undefined;

const CLASSE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  "Petite Section": "P.Sec",
  "Moyenne Section": "M.Sec",
  "Grande Section": "G.Sec",
  "1ere Annee": "1è An.",
  "2eme Annee": "2è An.",
  "3eme Annee": "3è An.",
  "4eme Annee": "4è An.",
  "5eme Annee": "5è An.",
  "6eme Annee": "6è An.",
  "7eme Annee": "7è An.",
  "8eme Annee": "8è An.",
  "9eme Annee": "9è An.",
};

/** Abréviation affichable d'un nom de classe dans les sélecteurs. */
export function getClasseAbbreviation(nomClasse: string): string {
  const trimmed = nomClasse.trim();
  return CLASSE_ABBREVIATIONS[trimmed] ?? trimmed;
}

function resolveClasseLabel(classe: ClasseLabelInput): string | undefined {
  const nom = typeof classe === "string" ? classe.trim() : classe?.nom?.trim();
  return nom ? getClasseAbbreviation(nom) : undefined;
}

/** Libellé affichable : « {classe abrégée} - {nom_salle} » (ex. « 1è An. - A »). */
export function getSalleDisplayName(
  salle: SalleLabelInput,
  classe: ClasseLabelInput,
): string {
  const classeNom = resolveClasseLabel(classe);
  const salleNom = salle.nom_salle?.trim() || salle.nom.trim();
  if (classeNom && salleNom) {
    return `${classeNom} - ${salleNom}`;
  }
  return classeNom || salleNom || "—";
}

export function buildClassesNiveauMap(
  classes: ClasseNiveau[],
): Map<string, ClasseNiveau> {
  return new Map(classes.map((c) => [c.id, c]));
}

export function buildCyclesMap(cycles: Cycle[]): Map<string, Cycle> {
  return new Map(cycles.map((c) => [c.id, c]));
}

type ClasseOrdreInput = Pick<ClasseNiveau, "cycle_id" | "ordre">;

function compareClasseOrdre(
  a: ClasseOrdreInput,
  b: ClasseOrdreInput,
  cyclesMap: Map<string, Cycle>,
): number {
  const cycleOrdre = (cycleId: string): number =>
    cyclesMap.get(cycleId)?.ordre ?? Number.MAX_SAFE_INTEGER;

  const cycleDiff = cycleOrdre(a.cycle_id) - cycleOrdre(b.cycle_id);
  if (cycleDiff !== 0) return cycleDiff;
  return a.ordre - b.ordre;
}

/** Tri pour sélecteurs de classes : cycle.ordre → classe.ordre. */
export function sortClassesForSelect<T extends ClasseOrdreInput & { id: string }>(
  classes: T[],
  cyclesMap: Map<string, Cycle>,
): T[] {
  return [...classes].sort((a, b) => compareClasseOrdre(a, b, cyclesMap));
}

type ClasseRefSortInput = { classe_id: string };

/** Tri par référence classe_id (stats, listes dérivées). */
export function sortByClasseRefForSelect<T extends ClasseRefSortInput>(
  items: T[],
  classesMap: Map<string, ClasseNiveau>,
  cyclesMap: Map<string, Cycle>,
): T[] {
  const resolve = (classeId: string): ClasseOrdreInput => {
    const classe = classesMap.get(classeId);
    return classe ?? { cycle_id: "", ordre: Number.MAX_SAFE_INTEGER };
  };

  return [...items].sort((a, b) =>
    compareClasseOrdre(resolve(a.classe_id), resolve(b.classe_id), cyclesMap),
  );
}

type SalleSortInput = Pick<Salle, "classe_id" | "nom" | "nom_salle">;

function salleSortLabel(salle: SalleSortInput): string {
  return (salle.nom_salle?.trim() || salle.nom.trim()).toLocaleLowerCase("fr");
}

/** Tri pour sélecteurs : cycle.ordre → classe.ordre → nom_salle (A, B, C…). */
export function sortSallesForSelect<T extends SalleSortInput>(
  salles: T[],
  classesMap: Map<string, ClasseNiveau>,
  cyclesMap: Map<string, Cycle>,
): T[] {
  const classeOrdre = (classeId: string): ClasseOrdreInput =>
    classesMap.get(classeId) ?? { cycle_id: "", ordre: Number.MAX_SAFE_INTEGER };

  return [...salles].sort((a, b) => {
    const ordreDiff = compareClasseOrdre(
      classeOrdre(a.classe_id),
      classeOrdre(b.classe_id),
      cyclesMap,
    );
    if (ordreDiff !== 0) return ordreDiff;

    return salleSortLabel(a).localeCompare(salleSortLabel(b), "fr");
  });
}

export function getSalleDisplayNameById(
  salleId: string,
  salles: Array<Pick<Salle, "id" | "nom" | "nom_salle" | "classe_id">>,
  classesMap: Map<string, ClasseNiveau>,
): string {
  const salle = salles.find((s) => s.id === salleId);
  if (!salle) return "—";
  return getSalleDisplayName(salle, classesMap.get(salle.classe_id) ?? null);
}

export function parseCapaciteInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}
