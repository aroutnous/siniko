import type { Classe, ClasseNiveau, DossierEleve, Inscription } from "@/types";

import { getSalleDisplayName } from "@/lib/etablissement-utils";

export function getActiveInscription(
  inscriptions: Inscription[],
): Inscription | undefined {
  return inscriptions.find((i) => i.statut === "inscrit");
}

export interface SalleDisplayFields {
  nom: string;
  nom_salle?: string | null;
  classe_id?: string;
  niveau_nom?: string | null;
}

/** Libellé affichable d'une salle : « {classe} - {nom_salle} ». */
export function formatSalleNom(
  salle: Pick<Classe, "nom" | "nom_salle" | "classe_id"> | SalleDisplayFields,
  niveauxMap?: Map<string, string>,
): string {
  const classeNom =
    ("niveau_nom" in salle && salle.niveau_nom?.trim()) ||
    (salle.classe_id ? niveauxMap?.get(salle.classe_id) : undefined);
  return getSalleDisplayName(salle, classeNom ?? null);
}

export function inscriptionSalleLabel(
  inscription: Pick<Inscription, "classe_id" | "salle_nom"> & {
    salle?: SalleDisplayFields | null;
  },
  salles: Classe[],
  niveauxMap?: Map<string, string>,
): string {
  if (inscription.salle_nom?.trim()) {
    return inscription.salle_nom.trim();
  }
  if (inscription.salle) {
    return formatSalleNom(inscription.salle, niveauxMap);
  }
  return resolveSalleNom(inscription.classe_id, salles, niveauxMap);
}

export function buildNiveauxMap(niveaux: ClasseNiveau[]): Map<string, string> {
  return new Map(niveaux.map((n) => [n.id, n.nom]));
}

export function resolveSalleNom(
  salleId: string | undefined,
  salles: Classe[],
  niveauxMap?: Map<string, string>,
): string {
  if (!salleId) return "—";
  const salle = salles.find((s) => s.id === salleId);
  if (!salle) return "—";
  return formatSalleNom(salle, niveauxMap);
}

/** @deprecated Utiliser `resolveSalleNom`. */
export function resolveClasseNom(
  classeId: string | undefined,
  classes: Classe[],
  niveauxMap?: Map<string, string>,
): string {
  return resolveSalleNom(classeId, classes, niveauxMap);
}

export function getEleveClasseId(dossier: DossierEleve): string | undefined {
  return getActiveInscription(dossier.inscriptions)?.classe_id;
}

export function getDossierSalleNom(dossier: DossierEleve): string {
  if (dossier.salle_active_nom?.trim()) {
    return dossier.salle_active_nom.trim();
  }
  const active = getActiveInscription(dossier.inscriptions);
  if (active?.salle_nom?.trim()) {
    return active.salle_nom.trim();
  }
  if (active?.salle) {
    return formatSalleNom(active.salle);
  }
  return "—";
}
