import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useClassesSelectData } from "@/hooks/useClassesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import {
  getClasseAbbreviation,
  getSalleDisplayName,
  parseCapaciteInput,
} from "@/lib/etablissement-utils";
import { useToastStore } from "@/stores/toastStore";
import type {
  AnneeScolaire,
  Salle,
  SalleEffectif,
} from "@/types";

interface SalleForm {
  classe_id: string;
  annee_scolaire_id: string;
  nom_salle: string;
  capacite: string;
}

interface SalleRow extends Salle {
  classe_nom: string;
  effectif: number;
  est_complete: boolean;
}

const INITIAL: SalleForm = {
  classe_id: "",
  annee_scolaire_id: "",
  nom_salle: "",
  capacite: "",
};

export function SallesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { can } = useMenuAccess();
  const canConfigure = can.etablissementConfigurer;
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Salle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Salle | null>(null);
  const [form, setForm] = useState<SalleForm>(INITIAL);

  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
    retry: false,
  });

  const { sortedClasses, classesMap } = useClassesSelectData();

  const { data: salles = [], isLoading } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const effectifQueries = useQueries({
    queries: salles.map((salle) => ({
      queryKey: ["salle-effectif", salle.id],
      queryFn: async () => {
        const { data } = await api.get<SalleEffectif>(
          `${ETABLISSEMENT_API.salles}/${salle.id}/effectif`,
        );
        return data;
      },
    })),
  });

  const rows: SalleRow[] = useMemo(() => {
    return salles.map((salle, index) => {
      const eff = effectifQueries[index]?.data;
      return {
        ...salle,
        classe_nom: classesMap.get(salle.classe_id)?.nom ?? "—",
        effectif: eff?.effectif ?? 0,
        est_complete: eff?.est_complete ?? false,
      };
    });
  }, [salles, classesMap, effectifQueries]);

  const saveMutation = useMutation({
    mutationFn: async ({ payload, id }: { payload: SalleForm; id?: string }) => {
      const capacite = parseCapaciteInput(payload.capacite);
      if (payload.capacite.trim() && capacite === null) {
        throw new Error("Capacité invalide (entier ≥ 1)");
      }
      const body: {
        classe_id: string;
        annee_scolaire_id: string;
        nom_salle: string;
        capacite?: number;
      } = {
        classe_id: payload.classe_id,
        annee_scolaire_id: payload.annee_scolaire_id,
        nom_salle: payload.nom_salle.trim(),
      };
      if (capacite !== null) {
        body.capacite = capacite;
      }
      if (id) {
        const { data } = await api.put<Salle>(`${ETABLISSEMENT_API.salles}/${id}`, body);
        return data;
      }
      const { data } = await api.post<Salle>(ETABLISSEMENT_API.salles, body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["salles"] });
      void queryClient.invalidateQueries({ queryKey: ["salle-effectif"] });
      void queryClient.invalidateQueries({ queryKey: ["etablissement-structure"] });
      toast(editTarget ? "Salle modifiée" : "Salle créée");
      setOpen(false);
      setEditTarget(null);
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${ETABLISSEMENT_API.salles}/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["salles"] });
      toast("Salle supprimée");
      setDeleteTarget(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const openCreate = (): void => {
    setEditTarget(null);
    setForm({
      ...INITIAL,
      annee_scolaire_id: anneeActive?.id ?? "",
    });
    setOpen(true);
  };

  const openEdit = (salle: Salle): void => {
    setEditTarget(salle);
    setForm({
      classe_id: salle.classe_id,
      annee_scolaire_id: salle.annee_scolaire_id,
      nom_salle: salle.nom_salle ?? salle.nom,
      capacite: salle.capacite != null ? String(salle.capacite) : "",
    });
    setOpen(true);
  };

  const columns: DataTableColumn<SalleRow>[] = [
    {
      key: "nom",
      header: "Salle",
      render: (r) => getSalleDisplayName(r, r.classe_nom),
    },
    { key: "classe", header: "Classe", render: (r) => r.classe_nom },
    {
      key: "capacite",
      header: "Capacité",
      render: (r) => (r.capacite != null ? String(r.capacite) : "∞"),
    },
    {
      key: "effectif",
      header: "Effectif",
      render: (r) => (
        <span className={r.est_complete ? "font-medium text-destructive" : ""}>
          {r.effectif}
          {r.est_complete ? " (complète)" : ""}
        </span>
      ),
    },
    {
      key: "statut",
      header: "Statut",
      render: (r) =>
        r.est_complete ? (
          <StatusBadge status="complete" />
        ) : (
          <StatusBadge status="actif" label="Disponible" />
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        canConfigure ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
              <Pencil className="mr-1 h-4 w-4" />
              Modifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeleteTarget(r)}
            >
              <Trash2 className="h-4 w-4" />
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
        title="Salles"
        description="Divisions physiques par classe (ex. Salle A, Salle B)"
      />

      <div className="mb-4 flex justify-end">
        {canConfigure ? (
          <Button onClick={openCreate} disabled={!anneeActive}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle salle
          </Button>
        ) : null}
      </div>

      {!anneeActive ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Activez une année scolaire avant de créer des salles.
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        page={1}
        pageSize={rows.length || 10}
        total={rows.length}
        onPageChange={() => undefined}
        emptyMessage="Aucune salle"
      />

      <FormModal
        open={open}
        title={editTarget ? "Modifier la salle" : "Nouvelle salle"}
        onClose={() => {
          setOpen(false);
          setEditTarget(null);
        }}
        onSubmit={() => saveMutation.mutate({ payload: form, id: editTarget?.id })}
        loading={saveMutation.isPending}
        submitLabel={editTarget ? "Enregistrer" : "Créer"}
      >
        <div className="space-y-2">
          <Label htmlFor="classe_id">Classe</Label>
          <Select
            id="classe_id"
            value={form.classe_id}
            onChange={(e) => setForm((p) => ({ ...p, classe_id: e.target.value }))}
            required
            disabled={Boolean(editTarget)}
          >
            <option value="">Sélectionner</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {getClasseAbbreviation(c.nom)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nom_salle">Nom de la salle</Label>
          <Input
            id="nom_salle"
            value={form.nom_salle}
            onChange={(e) => setForm((p) => ({ ...p, nom_salle: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacite">Capacité</Label>
          <Input
            id="capacite"
            type="number"
            min="1"
            value={form.capacite}
            onChange={(e) => setForm((p) => ({ ...p, capacite: e.target.value }))}
          />
        </div>
      </FormModal>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <h2 className="mb-2 text-lg font-semibold">Supprimer la salle</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Supprimer {deleteTarget ? getSalleDisplayName(deleteTarget, classesMap.get(deleteTarget.classe_id) ?? null) : ""} ? Cette action est
          irréversible.
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
