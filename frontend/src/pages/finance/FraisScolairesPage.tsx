import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { FINANCE_API } from "@/lib/finance-api";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, FraisScolaire, Niveau } from "@/types";

interface FraisForm {
  libelle: string;
  montant: string;
  niveau_id: string;
  annee_scolaire_id: string;
  est_obligatoire: string;
}

interface FraisRow extends FraisScolaire {
  niveau_nom: string;
  annee_libelle: string;
}

const INITIAL: FraisForm = {
  libelle: "",
  montant: "",
  niveau_id: "",
  annee_scolaire_id: "",
  est_obligatoire: "true",
};

export function FraisScolairesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canManageFrais } = useFinanceAccess();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FraisForm>(INITIAL);
  const [anneeFilter, setAnneeFilter] = useState("");

  const { data: niveaux = [] } = useQuery({
    queryKey: ["niveaux"],
    queryFn: async () => {
      const { data } = await api.get<Niveau[]>(ETABLISSEMENT_API.niveaux);
      return data;
    },
  });

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

  const { data: frais = [], isLoading } = useQuery({
    queryKey: ["frais", anneeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (anneeFilter) params.annee_id = anneeFilter;
      const { data } = await api.get<FraisScolaire[]>(FINANCE_API.frais, { params });
      return data;
    },
  });

  const niveauMap = useMemo(() => new Map(niveaux.map((n) => [n.id, n.nom])), [niveaux]);
  const anneeMap = useMemo(() => new Map(annees.map((a) => [a.id, a.libelle])), [annees]);

  const rows: FraisRow[] = frais.map((f) => ({
    ...f,
    niveau_nom: niveauMap.get(f.niveau_id) ?? "—",
    annee_libelle: anneeMap.get(f.annee_scolaire_id) ?? "—",
  }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<FraisScolaire>(FINANCE_API.frais, {
        libelle: form.libelle,
        montant: form.montant,
        niveau_id: form.niveau_id,
        annee_scolaire_id: form.annee_scolaire_id,
        est_obligatoire: form.est_obligatoire === "true",
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["frais"] });
      toast("Frais scolaire créé");
      setOpen(false);
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<FraisRow>[] = [
    { key: "libelle", header: "Libellé", render: (r) => r.libelle },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${Number(r.montant).toLocaleString("fr-FR")} FCFA`,
    },
    { key: "niveau", header: "Niveau", render: (r) => r.niveau_nom },
    { key: "annee", header: "Année", render: (r) => r.annee_libelle },
    {
      key: "obligatoire",
      header: "Type",
      render: (r) => (
        <Badge variant={r.est_obligatoire ? "warning" : "muted"}>
          {r.est_obligatoire ? "Obligatoire" : "Optionnel"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={anneeFilter}
          onChange={(e) => setAnneeFilter(e.target.value)}
          className="max-w-[220px]"
        >
          <option value="">Toutes les années</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
            </option>
          ))}
        </Select>
        {canManageFrais ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau frais
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          page={1}
          pageSize={rows.length || 1}
          total={rows.length}
          onPageChange={() => {}}
          emptyMessage="Aucun frais configuré"
        />
      )}

      <FormModal
        open={open}
        title="Nouveau frais scolaire"
        onClose={() => {
          setOpen(false);
          setForm(INITIAL);
        }}
        onSubmit={() => createMutation.mutate()}
        loading={createMutation.isPending}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="libelle">Libellé *</Label>
            <Input
              id="libelle"
              value={form.libelle}
              onChange={(e) => setForm((p) => ({ ...p, libelle: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="montant">Montant (FCFA) *</Label>
            <Input
              id="montant"
              type="number"
              min="1"
              value={form.montant}
              onChange={(e) => setForm((p) => ({ ...p, montant: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="niveau_id">Niveau *</Label>
            <Select
              id="niveau_id"
              value={form.niveau_id}
              onChange={(e) => setForm((p) => ({ ...p, niveau_id: e.target.value }))}
              required
            >
              <option value="">Sélectionner</option>
              {niveaux.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nom}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="annee_scolaire_id">Année scolaire *</Label>
            <Select
              id="annee_scolaire_id"
              value={form.annee_scolaire_id}
              onChange={(e) => setForm((p) => ({ ...p, annee_scolaire_id: e.target.value }))}
              required
            >
              <option value="">Sélectionner</option>
              {annees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="est_obligatoire">Type *</Label>
            <Select
              id="est_obligatoire"
              value={form.est_obligatoire}
              onChange={(e) => setForm((p) => ({ ...p, est_obligatoire: e.target.value }))}
            >
              <option value="true">Obligatoire</option>
              <option value="false">Optionnel</option>
            </Select>
          </div>
        </div>
      </FormModal>
    </div>
  );
}
