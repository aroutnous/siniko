import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { api, getErrorMessage } from "@/lib/api";
import { FINANCE_API } from "@/lib/finance-api";
import { useToastStore } from "@/stores/toastStore";
import type { Salaire, StatutSalaire } from "@/types";

interface SalaireForm {
  employe_id: string;
  mois: string;
  montant_brut: string;
  montant_net: string;
}

const INITIAL: SalaireForm = {
  employe_id: "",
  mois: new Date().toISOString().slice(0, 7) + "-01",
  montant_brut: "",
  montant_net: "",
};

export function SalairesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canManageSalaires } = useFinanceAccess();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SalaireForm>(INITIAL);
  const [moisFilter, setMoisFilter] = useState("");

  const { data: salaires = [], isLoading } = useQuery({
    queryKey: ["salaires", moisFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (moisFilter) params.mois = moisFilter;
      const { data } = await api.get<Salaire[]>(FINANCE_API.salaires, { params });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Salaire>(FINANCE_API.salaires, {
        employe_id: form.employe_id,
        mois: form.mois,
        montant_brut: form.montant_brut,
        montant_net: form.montant_net,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["salaires"] });
      toast("Salaire enregistré");
      setOpen(false);
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const statutBadge = (statut: StatutSalaire): React.JSX.Element => (
    <Badge variant={statut === "paye" ? "success" : "warning"}>
      {statut === "paye" ? "Payé" : "En attente"}
    </Badge>
  );

  const columns: DataTableColumn<Salaire>[] = [
    { key: "mois", header: "Mois", render: (r) => r.mois },
    {
      key: "employe",
      header: "Employé",
      render: (r) => r.employe_id.slice(0, 8) + "…",
    },
    {
      key: "brut",
      header: "Brut",
      render: (r) => `${Number(r.montant_brut).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "net",
      header: "Net",
      render: (r) => `${Number(r.montant_net).toLocaleString("fr-FR")} FCFA`,
    },
    { key: "statut", header: "Statut", render: (r) => statutBadge(r.statut) },
    {
      key: "date",
      header: "Date paiement",
      render: (r) => r.date_paiement ?? "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          type="month"
          value={moisFilter ? moisFilter.slice(0, 7) : ""}
          onChange={(e) => setMoisFilter(e.target.value ? `${e.target.value}-01` : "")}
          className="max-w-[200px]"
        />
        {canManageSalaires ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Payer un salaire
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={salaires}
          page={1}
          pageSize={salaires.length || 1}
          total={salaires.length}
          onPageChange={() => {}}
          emptyMessage="Aucun salaire enregistré"
        />
      )}

      <FormModal
        open={open}
        title="Paiement salaire"
        onClose={() => {
          setOpen(false);
          setForm(INITIAL);
        }}
        onSubmit={() => createMutation.mutate()}
        loading={createMutation.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>ID employé (UUID) *</Label>
            <Input
              value={form.employe_id}
              onChange={(e) => setForm((p) => ({ ...p, employe_id: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Mois *</Label>
            <Input
              type="date"
              value={form.mois}
              onChange={(e) => setForm((p) => ({ ...p, mois: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Montant brut *</Label>
            <Input
              type="number"
              min="1"
              value={form.montant_brut}
              onChange={(e) => setForm((p) => ({ ...p, montant_brut: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Montant net *</Label>
            <Input
              type="number"
              min="1"
              value={form.montant_net}
              onChange={(e) => setForm((p) => ({ ...p, montant_net: e.target.value }))}
              required
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}
