import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { api, getErrorMessage } from "@/lib/api";
import { ENSEIGNANTS_API } from "@/lib/enseignants-api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { useToastStore } from "@/stores/toastStore";
import type { ClasseNiveau, Cycle, Enseignant, Matiere } from "@/types";

interface MatiereForm {
  nom: string;
  classe_id: string;
  coefficient: string;
  note_max: string;
  est_obligatoire: boolean;
  est_domaine_competence: boolean;
  ordre: string;
  est_active: boolean;
  enseignant_principal_id: string;
  enseignant_assistant_id: string;
}

const INITIAL: MatiereForm = {
  nom: "",
  classe_id: "",
  coefficient: "1",
  note_max: "",
  est_obligatoire: true,
  est_domaine_competence: false,
  ordre: "0",
  est_active: true,
  enseignant_principal_id: "",
  enseignant_assistant_id: "",
};

function formatEnseignant(e: Enseignant): string {
  return `${e.prenom} ${e.nom}`.trim();
}

function formatEnseignantsCell(m: Matiere): string {
  const parts: string[] = [];
  if (m.enseignant_principal_nom) {
    parts.push(`Principal : ${m.enseignant_principal_nom}`);
  }
  if (m.enseignant_assistant_nom) {
    parts.push(`Assistant : ${m.enseignant_assistant_nom}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatNoteMax(m: Matiere): string {
  if (m.note_max != null) return String(m.note_max);
  if (m.note_max_effective != null) {
    return `${m.note_max_effective} (cycle)`;
  }
  return "—";
}

function toPayload(form: MatiereForm): Record<string, unknown> {
  return {
    nom: form.nom,
    classe_id: form.classe_id,
    coefficient: Number(form.coefficient),
    note_max: form.note_max.trim() ? Number(form.note_max) : null,
    est_obligatoire: form.est_obligatoire,
    est_domaine_competence: form.est_domaine_competence,
    ordre: Number(form.ordre) || 0,
    est_active: form.est_active,
    enseignant_principal_id: form.enseignant_principal_id || null,
    enseignant_assistant_id: form.enseignant_assistant_id || null,
  };
}

export function MatieresPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { can } = useMenuAccess();
  const canConfigure = can.etablissementConfigurer;
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Matiere | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Matiere | null>(null);
  const [form, setForm] = useState<MatiereForm>(INITIAL);

  const { data: cycles = [], isLoading: loadingCycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await api.get<Cycle[]>(ETABLISSEMENT_API.cycles);
      return data;
    },
  });

  const { data: classesNiveau = [], isLoading: loadingClasses } = useQuery({
    queryKey: ["classes-niveau"],
    queryFn: async () => {
      const { data } = await api.get<ClasseNiveau[]>(ETABLISSEMENT_API.classesNiveau);
      return data;
    },
  });

  const { data: enseignants = [], isLoading: loadingEnseignants } = useQuery({
    queryKey: ["enseignants"],
    queryFn: async () => {
      const { data } = await api.get<Enseignant[]>(ENSEIGNANTS_API.list);
      return data;
    },
  });

  const { data: matieres = [], isLoading: loadingMatieres } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const classesById = useMemo(
    () => new Map(classesNiveau.map((c) => [c.id, c])),
    [classesNiveau],
  );

  const cyclesById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);

  const grouped = useMemo(() => {
    const matieresByClasse = new Map<string, Matiere[]>();
    for (const matiere of matieres) {
      const list = matieresByClasse.get(matiere.classe_id) ?? [];
      list.push(matiere);
      matieresByClasse.set(matiere.classe_id, list);
    }

    const classesByCycle = new Map<string, ClasseNiveau[]>();
    for (const classe of classesNiveau) {
      const list = classesByCycle.get(classe.cycle_id) ?? [];
      list.push(classe);
      classesByCycle.set(classe.cycle_id, list);
    }

    const sortedCycles = [...cycles].sort(
      (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"),
    );

    return sortedCycles.map((cycle) => {
      const classes = (classesByCycle.get(cycle.id) ?? []).sort(
        (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"),
      );
      return {
        cycle,
        classes: classes.map((classe) => ({
          classe,
          matieres: (matieresByClasse.get(classe.id) ?? []).sort(
            (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"),
          ),
        })),
      };
    });
  }, [cycles, classesNiveau, matieres]);

  const selectedClasse = form.classe_id ? classesById.get(form.classe_id) : undefined;
  const selectedCycle = selectedClasse
    ? cyclesById.get(selectedClasse.cycle_id)
    : undefined;

  const saveMutation = useMutation({
    mutationFn: async ({ payload, id }: { payload: MatiereForm; id?: string }) => {
      const body = toPayload(payload);
      if (id) {
        const { data } = await api.put<Matiere>(
          `${ETABLISSEMENT_API.matieres}/${id}`,
          body,
        );
        return data;
      }
      const { data } = await api.post<Matiere>(ETABLISSEMENT_API.matieres, body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matieres"] });
      toast(editTarget ? "Matière modifiée" : "Matière créée");
      setOpen(false);
      setEditTarget(null);
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${ETABLISSEMENT_API.matieres}/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matieres"] });
      toast("Matière supprimée");
      setDeleteTarget(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const openCreate = (): void => {
    setEditTarget(null);
    setForm(INITIAL);
    setOpen(true);
  };

  const openEdit = (matiere: Matiere): void => {
    setEditTarget(matiere);
    setForm({
      nom: matiere.nom,
      classe_id: matiere.classe_id,
      coefficient: String(matiere.coefficient),
      note_max: matiere.note_max != null ? String(matiere.note_max) : "",
      est_obligatoire: matiere.est_obligatoire,
      est_domaine_competence: matiere.est_domaine_competence,
      ordre: String(matiere.ordre),
      est_active: matiere.est_active,
      enseignant_principal_id: matiere.enseignant_principal_id ?? "",
      enseignant_assistant_id: matiere.enseignant_assistant_id ?? "",
    });
    setOpen(true);
  };

  if (loadingCycles || loadingClasses || loadingMatieres || loadingEnseignants) {
    return <LoadingSpinner />;
  }

  const enseignantOptions = enseignants.filter((e) => e.statut === "actif");

  const formFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="classe_id">Classe</Label>
        <Select
          id="classe_id"
          value={form.classe_id}
          onChange={(e) => setForm((p) => ({ ...p, classe_id: e.target.value }))}
          required
        >
          <option value="">Sélectionner</option>
          {grouped.map(({ cycle, classes }) => (
            <optgroup key={cycle.id} label={cycle.nom}>
              {classes.map(({ classe }) => (
                <option key={classe.id} value={classe.id}>
                  {classe.nom}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cycle_nom">Cycle</Label>
        <Input
          id="cycle_nom"
          value={selectedCycle?.nom ?? ""}
          readOnly
          disabled
          placeholder="Sélectionnez une classe"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nom">Nom</Label>
        <Input
          id="nom"
          value={form.nom}
          onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="coefficient">Coefficient</Label>
          <Input
            id="coefficient"
            type="number"
            min="0.1"
            step="0.1"
            value={form.coefficient}
            onChange={(e) => setForm((p) => ({ ...p, coefficient: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note_max">Note max</Label>
          <Input
            id="note_max"
            type="number"
            min="0.1"
            step="0.1"
            value={form.note_max}
            onChange={(e) => setForm((p) => ({ ...p, note_max: e.target.value }))}
            placeholder={
              selectedCycle?.note_max != null
                ? `Hérite du cycle (${selectedCycle.note_max})`
                : "Hérite du cycle"
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ordre">Ordre (bulletin)</Label>
        <Input
          id="ordre"
          type="number"
          min="0"
          step="1"
          value={form.ordre}
          onChange={(e) => setForm((p) => ({ ...p, ordre: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="enseignant_principal_id">Enseignant principal</Label>
          <Select
            id="enseignant_principal_id"
            value={form.enseignant_principal_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, enseignant_principal_id: e.target.value }))
            }
          >
            <option value="">Aucun</option>
            {enseignantOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {formatEnseignant(e)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="enseignant_assistant_id">Enseignant assistant</Label>
          <Select
            id="enseignant_assistant_id"
            value={form.enseignant_assistant_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, enseignant_assistant_id: e.target.value }))
            }
          >
            <option value="">Aucun</option>
            {enseignantOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {formatEnseignant(e)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 pt-1">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.est_obligatoire}
            onChange={(e) =>
              setForm((p) => ({ ...p, est_obligatoire: e.target.checked }))
            }
          />
          Matière obligatoire
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.est_domaine_competence}
            onChange={(e) =>
              setForm((p) => ({ ...p, est_domaine_competence: e.target.checked }))
            }
          />
          Domaine de compétence
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.est_active}
            onChange={(e) => setForm((p) => ({ ...p, est_active: e.target.checked }))}
          />
          Active
        </label>
      </div>
    </>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Matières</h2>
        {canConfigure ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter une matière
          </Button>
        ) : null}
      </div>

      <div className="space-y-8">
        {grouped.map(({ cycle, classes }) => (
          <section key={cycle.id}>
            <h3 className="mb-4 text-base font-semibold text-foreground">{cycle.nom}</h3>
            <div className="space-y-6">
              {classes.map(({ classe, matieres: classeMatieres }) => (
                <div key={classe.id} className="rounded-lg border border-border p-4">
                  <h4 className="mb-3 font-medium">{classe.nom}</h4>
                  {classeMatieres.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune matière</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2">Nom</th>
                            <th className="px-4 py-2">Coefficient</th>
                            <th className="px-4 py-2">Note max</th>
                            <th className="px-4 py-2">Enseignants</th>
                            {canConfigure ? <th className="px-4 py-2">Actions</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {classeMatieres.map((m) => (
                            <tr key={m.id} className="border-t border-border">
                              <td className="px-4 py-2">{m.nom}</td>
                              <td className="px-4 py-2">{m.coefficient}</td>
                              <td className="px-4 py-2">{formatNoteMax(m)}</td>
                              <td className="px-4 py-2">{formatEnseignantsCell(m)}</td>
                              {canConfigure ? (
                                <td className="px-4 py-2">
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openEdit(m)}
                                    >
                                      <Pencil className="mr-1 h-4 w-4" />
                                      Éditer
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setDeleteTarget(m)}
                                    >
                                      <Trash2 className="mr-1 h-4 w-4" />
                                      Supprimer
                                    </Button>
                                  </div>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <FormModal
        open={open}
        title={editTarget ? "Modifier la matière" : "Ajouter une matière"}
        onClose={() => {
          setOpen(false);
          setEditTarget(null);
        }}
        onSubmit={() => saveMutation.mutate({ payload: form, id: editTarget?.id })}
        loading={saveMutation.isPending}
        submitLabel={editTarget ? "Enregistrer" : "Créer"}
      >
        {formFields}
      </FormModal>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <h2 className="mb-2 text-lg font-semibold">Supprimer cette matière ?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Cette action est irréversible. Les notes associées seront conservées mais
          orphelines.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
