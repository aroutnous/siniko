import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  NotesGrid,
  cellKey,
  type NotesGridState,
} from "@/components/pedagogie/NotesGrid";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { usePedagogieAccess } from "@/hooks/usePedagogieAccess";
import { api, getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import {
  buildClassesNiveauMap,
  buildCyclesMap,
  getSalleDisplayName,
  sortSallesForSelect,
} from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import {
  isValidNoteChiffree,
  usesPeriodeForCycle,
  usesSequenceForCycle,
} from "@/lib/pedagogie-utils";
import { useToastStore } from "@/stores/toastStore";
import type {
  ClasseNiveau,
  Cycle,
  Eleve,
  Matiere,
  Note,
  NoteCreatePayload,
  Periode,
  Salle,
  SequenceEvaluation,
} from "@/types";

export function SaisieNotesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canSaveNotes } = usePedagogieAccess();
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [matiereId, setMatiereId] = useState("");
  const [grid, setGrid] = useState<NotesGridState>({});

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { data: classesNiveau = [] } = useQuery({
    queryKey: ["classes-niveau"],
    queryFn: async () => {
      const { data } = await api.get<ClasseNiveau[]>(ETABLISSEMENT_API.classesNiveau);
      return data;
    },
  });

  const { data: cycles = [] } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await api.get<Cycle[]>(ETABLISSEMENT_API.cycles);
      return data;
    },
  });

  const { data: sequencesAll = [] } = useQuery({
    queryKey: ["sequences-evaluation"],
    queryFn: async () => {
      const { data } = await api.get<SequenceEvaluation[]>(
        ETABLISSEMENT_API.sequencesEvaluation,
      );
      return data;
    },
  });

  const { data: matieresAll = [] } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const classesMap = useMemo(
    () => buildClassesNiveauMap(classesNiveau),
    [classesNiveau],
  );

  const cyclesMap = useMemo(() => buildCyclesMap(cycles), [cycles]);

  const sortedSalles = useMemo(
    () => sortSallesForSelect(salles, classesMap, cyclesMap),
    [salles, classesMap, cyclesMap],
  );

  const selectedSalle = salles.find((s) => s.id === classeId);

  const selectedCycle = useMemo(() => {
    if (!selectedSalle) return null;
    const niveau = classesNiveau.find((c) => c.id === selectedSalle.classe_id);
    if (!niveau) return null;
    return cycles.find((c) => c.id === niveau.cycle_id) ?? null;
  }, [selectedSalle, classesNiveau, cycles]);

  const usesSequence = usesSequenceForCycle(selectedCycle);
  const usesPeriode = usesPeriodeForCycle(selectedCycle);
  const typeEvaluation = selectedCycle?.type_evaluation ?? "chiffree";
  const isQualitative = typeEvaluation === "qualitative";
  const noteMax = selectedCycle?.note_max ?? 20;
  const notePassage = selectedCycle?.note_passage ?? 10;

  const sequences = useMemo(() => {
    if (!selectedCycle) return [];
    return sequencesAll
      .filter((s) => s.cycle_id === selectedCycle.id)
      .sort((a, b) => a.ordre - b.ordre);
  }, [sequencesAll, selectedCycle]);

  const matieres = useMemo(() => {
    if (!selectedSalle) return [];
    return matieresAll
      .filter((m) => m.classe_id === selectedSalle.classe_id && m.est_active)
      .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));
  }, [matieresAll, selectedSalle]);

  const selectedMatiere = matieres.find((m) => m.id === matiereId) ?? null;

  const evaluationContextId = usesSequence ? sequenceId : periodeId;
  const canLoadGrid = Boolean(
    classeId && matiereId && evaluationContextId && (!usesSequence || sequences.length > 0),
  );

  const { data: eleves = [], isLoading: loadingEleves } = useQuery({
    queryKey: ["eleves", "", classeId, ""],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, {
        params: { classe_id: classeId },
      });
      return data;
    },
    enabled: Boolean(classeId),
  });

  const noteQueries = useQueries({
    queries: eleves.map((eleve) => ({
      queryKey: [
        "notes-eleve",
        eleve.id,
        usesSequence ? "seq" : "per",
        evaluationContextId,
      ],
      queryFn: async () => {
        const params: Record<string, string> = {};
        if (usesSequence && sequenceId) {
          params.sequence_id = sequenceId;
        } else if (periodeId) {
          params.periode_id = periodeId;
        }
        const { data } = await api.get<Note[]>(
          PEDAGOGIE_API.notesHistorique(eleve.id),
          { params },
        );
        return data;
      },
      enabled: canLoadGrid,
      staleTime: 30_000,
    })),
  });

  const loadingNotes = noteQueries.some((q) => q.isLoading);

  const eleveIdsKey = eleves.map((e) => e.id).join(",");
  const notesQueryKey = noteQueries
    .map((q) => `${q.dataUpdatedAt ?? 0}:${q.status}`)
    .join("|");

  useEffect(() => {
    setPeriodeId("");
    setSequenceId("");
    setMatiereId("");
    setGrid({});
  }, [classeId]);

  useEffect(() => {
    setGrid({});
  }, [periodeId, sequenceId, matiereId]);

  useEffect(() => {
    if (!canLoadGrid || !selectedMatiere) {
      setGrid((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    if (eleves.length === 0) {
      setGrid((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    if (noteQueries.some((q) => q.isLoading)) {
      return;
    }

    const next: NotesGridState = {};
    eleves.forEach((eleve, index) => {
      const notes = noteQueries[index]?.data ?? [];
      const existing = notes.find((n) => n.matiere_id === selectedMatiere.id);
      const key = cellKey(eleve.id, selectedMatiere.id);
      next[key] = {
        valeur: existing?.valeur != null ? String(existing.valeur) : "",
        valeur_qualitative: existing?.valeur_qualitative ?? "",
        appreciation: existing?.appreciation ?? "",
        noteId: existing?.id,
      };
    });
    setGrid(next);
  }, [
    canLoadGrid,
    selectedMatiere?.id,
    eleveIdsKey,
    notesQueryKey,
    isQualitative,
  ]);

  const saveMutation = useMutation({
    mutationFn: async (notes: NoteCreatePayload[]) => {
      const { data } = await api.post<Note[]>(PEDAGOGIE_API.notesBatch, { notes });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes-eleve"] });
      toast("Notes enregistrées");
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const handleChange = (
    key: string,
    field: keyof NotesGridState[string],
    value: string,
  ): void => {
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = (): void => {
    if (!classeId || !matiereId || !selectedMatiere) {
      toast("Sélectionnez une salle et une matière", "error");
      return;
    }
    if (usesSequence && !sequenceId) {
      toast("Sélectionnez une séquence d'évaluation", "error");
      return;
    }
    if (usesPeriode && !periodeId) {
      toast("Sélectionnez une période", "error");
      return;
    }

    const notes: NoteCreatePayload[] = [];
    for (const eleve of eleves) {
      const key = cellKey(eleve.id, selectedMatiere.id);
      const cell = grid[key];
      const base = {
        eleve_id: eleve.id,
        matiere_id: selectedMatiere.id,
        classe_id: classeId,
        appreciation: cell?.appreciation || undefined,
      };

      if (isQualitative) {
        if (!cell?.valeur_qualitative) continue;
        notes.push({
          ...base,
          periode_id: periodeId,
          valeur_qualitative: cell.valeur_qualitative,
        });
      } else if (usesSequence) {
        if (!cell?.valeur) continue;
        if (!isValidNoteChiffree(cell.valeur, noteMax)) {
          toast(
            `Note invalide pour ${eleve.nom} (0 à ${noteMax}, 2 décimales max)`,
            "error",
          );
          return;
        }
        notes.push({
          ...base,
          sequence_id: sequenceId,
          valeur: Number(cell.valeur),
        });
      } else {
        if (!cell?.valeur) continue;
        if (!isValidNoteChiffree(cell.valeur, noteMax)) {
          toast(
            `Note invalide pour ${eleve.nom} (0 à ${noteMax}, 2 décimales max)`,
            "error",
          );
          return;
        }
        notes.push({
          ...base,
          periode_id: periodeId,
          valeur: Number(cell.valeur),
        });
      }
    }

    if (notes.length === 0) {
      toast("Aucune note à enregistrer", "error");
      return;
    }
    saveMutation.mutate(notes);
  };

  const sequencesLink = `${ROUTES.etablissementMatieres}?tab=sequences`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saisie des notes"
        description="Saisie par salle, période ou séquence, et matière"
        breadcrumb="Pédagogie"
        action={
          canSaveNotes ? (
            <Button
              disabled={!canLoadGrid || saveMutation.isPending}
              onClick={handleSave}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <Select
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          className="max-w-[220px]"
        >
          <option value="">Sélectionner une salle</option>
          {sortedSalles.map((s) => (
            <option key={s.id} value={s.id}>
              {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
            </option>
          ))}
        </Select>

        {classeId && usesPeriode ? (
          <Select
            value={periodeId}
            onChange={(e) => setPeriodeId(e.target.value)}
            className="max-w-[220px]"
          >
            <option value="">Sélectionner une période</option>
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </Select>
        ) : null}

        {classeId && usesSequence ? (
          sequences.length > 0 ? (
            <Select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
              className="max-w-[260px]"
            >
              <option value="">Sélectionner une séquence</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </Select>
          ) : null
        ) : null}

        {classeId ? (
          <Select
            value={matiereId}
            onChange={(e) => setMatiereId(e.target.value)}
            className="max-w-[220px]"
            disabled={matieres.length === 0}
          >
            <option value="">Sélectionner une matière</option>
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {classeId && selectedSalle ? (
        <p className="text-sm text-muted-foreground">
          Niveau :{" "}
          {classesNiveau.find((c) => c.id === selectedSalle.classe_id)?.nom ?? "—"}
          {" · "}
          Cycle : <strong>{selectedCycle?.nom ?? "—"}</strong>
          {" · "}
          Évaluation :{" "}
          <strong>
            {isQualitative
              ? "qualitative (compétences)"
              : usesSequence
                ? "chiffrée (composition)"
                : "chiffrée (trimestre)"}
          </strong>
          {!isQualitative ? (
            <>
              {" · "}
              Note max : <strong>{noteMax}</strong>
              {" · "}
              Note de passage : <strong>{notePassage}</strong>
              {" · "}
              Notes en rouge = sous le seuil
            </>
          ) : null}
        </p>
      ) : null}

      {classeId && usesSequence && sequences.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aucune séquence d&apos;évaluation configurée. Configurez-en une dans{" "}
          <Link to={sequencesLink} className="font-medium underline">
            Matières &gt; Séquences d&apos;évaluation
          </Link>
          .
        </p>
      ) : null}

      {!classeId ? (
        <p className="text-sm text-muted-foreground">
          Sélectionnez une salle pour commencer la saisie.
        </p>
      ) : !canLoadGrid ? (
        <p className="text-sm text-muted-foreground">
          {usesSequence && sequences.length === 0
            ? "Configurez une séquence d'évaluation pour ce cycle."
            : "Sélectionnez une période ou séquence et une matière pour afficher la grille."}
        </p>
      ) : loadingEleves || loadingNotes ? (
        <LoadingSpinner />
      ) : (
        <NotesGrid
          eleves={eleves}
          matiere={selectedMatiere}
          values={grid}
          typeEvaluation={typeEvaluation}
          noteMax={noteMax}
          notePassage={notePassage}
          readOnly={!canSaveNotes}
          onChange={handleChange}
        />
      )}
    </div>
  );
}
