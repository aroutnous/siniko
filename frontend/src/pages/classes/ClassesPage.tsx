import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { StatusBadge } from "@/components/etablissement/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getClasseAbbreviation } from "@/lib/etablissement-utils";
import { useToastStore } from "@/stores/toastStore";
import type {
  ClasseNiveau,
  Cycle,
  EtablissementStructure,
  ValeurSysteme,
} from "@/types";

interface ClasseRow {
  id: string;
  nom: string;
  cycle_nom: string;
  nb_salles: number;
  statut: "actif" | "inactif";
}

interface ClasseCreateForm {
  cycle_id: string;
  valeur_systeme_ref: string;
}

interface ClasseEditForm {
  nom: string;
  ordre: string;
}

const CREATE_INITIAL: ClasseCreateForm = { cycle_id: "", valeur_systeme_ref: "" };
const EDIT_INITIAL: ClasseEditForm = { nom: "", ordre: "0" };

export function ClassesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { can } = useMenuAccess();
  const canConfigure = can.etablissementConfigurer;
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClasseNiveau | null>(null);
  const [createForm, setCreateForm] = useState<ClasseCreateForm>(CREATE_INITIAL);
  const [editForm, setEditForm] = useState<ClasseEditForm>(EDIT_INITIAL);
  const [editTarget, setEditTarget] = useState<ClasseNiveau | null>(null);
  const [cycleFilter, setCycleFilter] = useState("");

  const { data: structure, isLoading } = useQuery({
    queryKey: ["etablissement-structure"],
    queryFn: async () => {
      const { data } = await api.get<EtablissementStructure>(ETABLISSEMENT_API.structure);
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

  const selectedCycleNom = useMemo(
    () => cycles.find((c) => c.id === createForm.cycle_id)?.nom ?? "",
    [cycles, createForm.cycle_id],
  );

  const { data: valeursClasses = [] } = useQuery({
    queryKey: ["valeurs-classes", selectedCycleNom],
    queryFn: async () => {
      const { data } = await api.get<ValeurSysteme[]>(ETABLISSEMENT_API.valeursClasses, {
        params: { cycle: selectedCycleNom },
      });
      return data;
    },
    enabled: Boolean(selectedCycleNom),
  });

  const sortedValeursClasses = useMemo(
    () => [...valeursClasses].sort((a, b) => a.ordre - b.ordre),
    [valeursClasses],
  );

  const classeMap = useMemo(
    () => new Map(classesNiveau.map((c) => [c.id, c])),
    [classesNiveau],
  );

  const rows: ClasseRow[] = useMemo(() => {
    if (!structure) return [];
    const list: ClasseRow[] = [];
    for (const cycle of structure.cycles) {
      for (const classe of cycle.classes) {
        list.push({
          id: classe.id,
          nom: classe.nom,
          cycle_nom: cycle.nom,
          nb_salles: classe.salles.length,
          statut: classe.salles.length > 0 ? "actif" : "inactif",
        });
      }
    }
    return list.filter((r) => !cycleFilter || r.cycle_nom === cycleFilter);
  }, [structure, cycleFilter]);

  const createMutation = useMutation({
    mutationFn: async (payload: ClasseCreateForm) => {
      const valeur = valeursClasses.find((v) => v.valeur === payload.valeur_systeme_ref);
      const { data } = await api.post<ClasseNiveau>(ETABLISSEMENT_API.classesNiveau, {
        cycle_id: payload.cycle_id,
        nom: payload.valeur_systeme_ref,
        ordre: valeur?.ordre ?? 0,
        valeur_systeme_ref: payload.valeur_systeme_ref,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["etablissement-structure"] });
      void queryClient.invalidateQueries({ queryKey: ["classes-niveau"] });
      toast("Classe créée");
      setOpenCreate(false);
      setCreateForm(CREATE_INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ClasseEditForm }) => {
      const { data } = await api.put<ClasseNiveau>(`${ETABLISSEMENT_API.classesNiveau}/${id}`, {
        nom: payload.nom,
        ordre: Number(payload.ordre),
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["etablissement-structure"] });
      void queryClient.invalidateQueries({ queryKey: ["classes-niveau"] });
      toast("Classe modifiée");
      setOpenEdit(false);
      setEditTarget(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${ETABLISSEMENT_API.classesNiveau}/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["etablissement-structure"] });
      void queryClient.invalidateQueries({ queryKey: ["classes-niveau"] });
      toast("Classe supprimée");
      setDeleteTarget(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const startEdit = (row: ClasseRow): void => {
    const classe = classeMap.get(row.id);
    if (!classe) return;
    setEditTarget(classe);
    setEditForm({ nom: classe.nom, ordre: String(classe.ordre) });
    setOpenEdit(true);
  };

  const columns: DataTableColumn<ClasseRow>[] = [
    { key: "nom", header: "Classe", render: (r) => r.nom },
    { key: "cycle", header: "Cycle", render: (r) => r.cycle_nom },
    { key: "salles", header: "Salles", render: (r) => String(r.nb_salles) },
    {
      key: "statut",
      header: "Statut",
      render: (r) => (
        <StatusBadge
          status={r.statut === "actif" ? "actif" : "inactif"}
          label={r.statut === "actif" ? "Configurée" : "Sans salle"}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        canConfigure ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
              <Pencil className="mr-1 h-4 w-4" />
              Modifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const c = classeMap.get(r.id);
                if (c) setDeleteTarget(c);
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Supprimer
            </Button>
          </div>
        ) : (
          "—"
        ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Niveaux scolaires de l'établissement (ex. 1ère Année, CM2…)"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select
          value={cycleFilter}
          onChange={(e) => setCycleFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Tous les cycles</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.nom}>
              {c.nom}
            </option>
          ))}
        </Select>
        {canConfigure ? (
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle classe
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        page={1}
        pageSize={rows.length || 10}
        total={rows.length}
        onPageChange={() => undefined}
        emptyMessage="Aucune classe configurée"
      />

      <FormModal
        open={openCreate}
        title="Nouvelle classe"
        onClose={() => setOpenCreate(false)}
        onSubmit={() => createMutation.mutate(createForm)}
        loading={createMutation.isPending}
        submitLabel="Créer"
      >
        <div className="space-y-2">
          <Label htmlFor="cycle_id">Cycle</Label>
          <Select
            id="cycle_id"
            value={createForm.cycle_id}
            onChange={(e) =>
              setCreateForm({ cycle_id: e.target.value, valeur_systeme_ref: "" })
            }
            required
          >
            <option value="">Sélectionner</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="valeur">Classe prédéfinie</Label>
          <Select
            id="valeur"
            value={createForm.valeur_systeme_ref}
            onChange={(e) =>
              setCreateForm((p) => ({ ...p, valeur_systeme_ref: e.target.value }))
            }
            required
            disabled={!createForm.cycle_id}
          >
            <option value="">Sélectionner</option>
            {sortedValeursClasses.map((v) => (
              <option key={v.id} value={v.valeur}>
                {getClasseAbbreviation(v.valeur)}
              </option>
            ))}
          </Select>
        </div>
      </FormModal>

      <FormModal
        open={openEdit}
        title="Modifier la classe"
        onClose={() => {
          setOpenEdit(false);
          setEditTarget(null);
        }}
        onSubmit={() =>
          editTarget && updateMutation.mutate({ id: editTarget.id, payload: editForm })
        }
        loading={updateMutation.isPending}
        submitLabel="Enregistrer"
      >
        <div className="space-y-2">
          <Label htmlFor="edit_nom">Nom</Label>
          <Input
            id="edit_nom"
            value={editForm.nom}
            onChange={(e) => setEditForm((p) => ({ ...p, nom: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_ordre">Ordre</Label>
          <Input
            id="edit_ordre"
            type="number"
            min="0"
            value={editForm.ordre}
            onChange={(e) => setEditForm((p) => ({ ...p, ordre: e.target.value }))}
          />
        </div>
      </FormModal>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <h2 className="mb-2 text-lg font-semibold">Confirmer la suppression</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Supprimer {deleteTarget?.nom} ? Cette action est irréversible.
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
