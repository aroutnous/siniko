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
import { useClassesSelectData } from "@/hooks/useClassesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getClasseAbbreviation } from "@/lib/etablissement-utils";
import { FINANCE_API } from "@/lib/finance-api";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, FraisScolaire } from "@/types";

interface FraisForm {
  libelle: string;
  montant: string;
  classe_id: string;
  annee_scolaire_id: string;
  est_obligatoire: string;
}

interface FraisRow extends FraisScolaire {
  classe_nom: string;
  annee_libelle: string;
}

const INITIAL: FraisForm = {
  libelle: "",
  montant: "",
  classe_id: "",
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

  const { sortedClasses, classesMap } = useClassesSelectData();

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

  const classeMap = useMemo(
    () => new Map([...classesMap.entries()].map(([id, c]) => [id, c.nom])),
    [classesMap],
  );
  const anneeMap = useMemo(() => new Map(annees.map((a) => [a.id, a.libelle])), [annees]);

  const rows: FraisRow[] = frais.map((f) => ({
    ...f,
    classe_nom: classeMap.get(f.classe_id) ?? "—",
    annee_libelle: anneeMap.get(f.annee_scolaire_id) ?? "—",
  }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<FraisScolaire>(FINANCE_API.frais, {
        libelle: form.libelle,
        montant: form.montant,
        classe_id: form.classe_id,
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
    { key: "classe", header: "Classe", render: (r) => r.classe_nom },
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
            <Label htmlFor="classe_id">Classe *</Label>
            <Select
              id="classe_id"
              value={form.classe_id}
              onChange={(e) => setForm((p) => ({ ...p, classe_id: e.target.value }))}
              required
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
