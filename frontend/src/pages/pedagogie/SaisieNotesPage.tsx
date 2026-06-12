import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
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
} from "@/types";

export function SaisieNotesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canSaveNotes } = usePedagogieAccess();
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
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

  const { data: matieresAll = [] } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const selectedSalle = salles.find((s) => s.id === classeId);

  const selectedCycle = useMemo(() => {
    if (!selectedSalle) return null;
    const niveau = classesNiveau.find((c) => c.id === selectedSalle.classe_id);
    if (!niveau) return null;
    return cycles.find((c) => c.id === niveau.cycle_id) ?? null;
  }, [selectedSalle, classesNiveau, cycles]);

  const typeEvaluation = selectedCycle?.type_evaluation ?? "chiffree";
  const isQualitative = typeEvaluation === "qualitative";
  const noteMax = selectedCycle?.note_max ?? 20;
  const notePassage = selectedCycle?.note_passage ?? 10;

  const matieres = useMemo(() => {
    if (!selectedSalle) return [];
    return matieresAll.filter(
      (m) => m.classe_id === selectedSalle.classe_id && m.est_active,
    );
  }, [matieresAll, selectedSalle]);

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
      queryKey: ["notes-eleve", eleve.id, periodeId],
      queryFn: async () => {
        const params: Record<string, string> = {};
        if (periodeId) params.periode_id = periodeId;
        const { data } = await api.get<Note[]>(
          PEDAGOGIE_API.notesHistorique(eleve.id),
          { params },
        );
        return data;
      },
      enabled: Boolean(classeId && periodeId),
      staleTime: 30_000,
    })),
  });

  const loadingNotes = noteQueries.some((q) => q.isLoading);

  const eleveIdsKey = eleves.map((e) => e.id).join(",");
  const matiereIdsKey = matieres.map((m) => m.id).join(",");
  const notesQueryKey = noteQueries
    .map((q) => `${q.dataUpdatedAt ?? 0}:${q.status}`)
    .join("|");

  useEffect(() => {
    if (!classeId || !periodeId) {
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
      matieres.forEach((matiere) => {
        const existing = notes.find(
          (n) => n.matiere_id === matiere.id && n.periode_id === periodeId,
        );
        const key = cellKey(eleve.id, matiere.id);
        next[key] = {
          valeur: existing?.valeur != null ? String(existing.valeur) : "",
          valeur_qualitative: existing?.valeur_qualitative ?? "",
          appreciation: existing?.appreciation ?? "",
          noteId: existing?.id,
        };
      });
    });
    setGrid(next);
  }, [classeId, periodeId, eleveIdsKey, matiereIdsKey, notesQueryKey, isQualitative]);

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
    if (!classeId || !periodeId) {
      toast("Sélectionnez une classe et une période", "error");
      return;
    }
    const notes: NoteCreatePayload[] = [];
    for (const eleve of eleves) {
      for (const matiere of matieres) {
        const key = cellKey(eleve.id, matiere.id);
        const cell = grid[key];
        if (isQualitative) {
          if (!cell?.valeur_qualitative) continue;
          notes.push({
            eleve_id: eleve.id,
            matiere_id: matiere.id,
            periode_id: periodeId,
            classe_id: classeId,
            valeur_qualitative: cell.valeur_qualitative,
            appreciation: cell.appreciation || undefined,
          });
        } else {
          if (!cell?.valeur) continue;
          const valeur = Number(cell.valeur);
          if (Number.isNaN(valeur) || valeur < 0 || valeur > noteMax) {
            toast(`Note invalide pour ${eleve.nom} — ${matiere.nom}`, "error");
            return;
          }
          notes.push({
            eleve_id: eleve.id,
            matiere_id: matiere.id,
            periode_id: periodeId,
            classe_id: classeId,
            valeur,
            appreciation: cell.appreciation || undefined,
          });
        }
      }
    }
    if (notes.length === 0) {
      toast("Aucune note à enregistrer", "error");
      return;
    }
    saveMutation.mutate(notes);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saisie des notes"
        description="Grille de saisie par classe et période"
        breadcrumb="Pédagogie"
        action={
          canSaveNotes ? (
            <Button
              disabled={!classeId || !periodeId || saveMutation.isPending}
              onClick={handleSave}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Enregistrement…" : "Enregistrer tout"}
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
          {salles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom_salle ?? s.nom}
            </option>
          ))}
        </Select>
        <Select
          value={periodeId}
          onChange={(e) => setPeriodeId(e.target.value)}
          className="max-w-[220px]"
          disabled={!classeId}
        >
          <option value="">Sélectionner une période</option>
          {periodes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </Select>
      </div>

      {classeId && selectedSalle ? (
        <p className="text-sm text-muted-foreground">
          Classe :{" "}
          {classesNiveau.find((c) => c.id === selectedSalle.classe_id)?.nom ?? "—"}
          {" · "}
          Cycle : <strong>{selectedCycle?.nom ?? "—"}</strong>
          {" · "}
          Évaluation :{" "}
          <strong>{isQualitative ? "qualitative (compétences)" : "chiffrée"}</strong>
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

      {!classeId || !periodeId ? (
        <p className="text-sm text-muted-foreground">
          Sélectionnez une salle et une période pour afficher la grille.
        </p>
      ) : loadingEleves || loadingNotes ? (
        <LoadingSpinner />
      ) : (
        <NotesGrid
          eleves={eleves}
          matieres={matieres}
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
