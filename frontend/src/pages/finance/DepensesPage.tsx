import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { api, getErrorMessage } from "@/lib/api";
import { FINANCE_API } from "@/lib/finance-api";
import { useToastStore } from "@/stores/toastStore";
import type { Depense } from "@/types";

interface DepenseForm {
  libelle: string;
  montant: string;
  categorie: string;
  date_depense: string;
  justificatif_url: string;
}

const INITIAL: DepenseForm = {
  libelle: "",
  montant: "",
  categorie: "",
  date_depense: new Date().toISOString().slice(0, 10),
  justificatif_url: "",
};

export function DepensesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canManageDepenses } = useFinanceAccess();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DepenseForm>(INITIAL);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const { data: depenses = [], isLoading } = useQuery({
    queryKey: ["depenses", dateDebut, dateFin],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dateDebut) params.date_debut = dateDebut;
      if (dateFin) params.date_fin = dateFin;
      const { data } = await api.get<Depense[]>(FINANCE_API.depenses, { params });
      return data;
    },
  });

  const total = useMemo(
    () => depenses.reduce((sum, d) => sum + Number(d.montant), 0),
    [depenses],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Depense>(FINANCE_API.depenses, {
        libelle: form.libelle,
        montant: form.montant,
        categorie: form.categorie,
        date_depense: form.date_depense,
        justificatif_url: form.justificatif_url || undefined,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["depenses"] });
      toast("Dépense enregistrée");
      setOpen(false);
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<Depense>[] = [
    { key: "date", header: "Date", render: (r) => r.date_depense },
    { key: "categorie", header: "Catégorie", render: (r) => r.categorie },
    { key: "libelle", header: "Libellé", render: (r) => r.libelle },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${Number(r.montant).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "justificatif",
      header: "Justificatif",
      render: (r) => r.justificatif_url ?? "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
        {canManageDepenses ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle dépense
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={depenses}
            page={1}
            pageSize={depenses.length || 1}
            total={depenses.length}
            onPageChange={() => {}}
            emptyMessage="Aucune dépense"
          />
          <p className="text-right font-medium">
            Total période : {total.toLocaleString("fr-FR")} FCFA
          </p>
        </>
      )}

      <FormModal
        open={open}
        title="Nouvelle dépense"
        onClose={() => {
          setOpen(false);
          setForm(INITIAL);
        }}
        onSubmit={() => createMutation.mutate()}
        loading={createMutation.isPending}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Libellé *</Label>
            <Input
              value={form.libelle}
              onChange={(e) => setForm((p) => ({ ...p, libelle: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Montant (FCFA) *</Label>
            <Input
              type="number"
              min="1"
              value={form.montant}
              onChange={(e) => setForm((p) => ({ ...p, montant: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Catégorie *</Label>
            <Input
              value={form.categorie}
              onChange={(e) => setForm((p) => ({ ...p, categorie: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input
              type="date"
              value={form.date_depense}
              onChange={(e) => setForm((p) => ({ ...p, date_depense: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Justificatif (URL)</Label>
            <Input
              value={form.justificatif_url}
              onChange={(e) => setForm((p) => ({ ...p, justificatif_url: e.target.value }))}
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}
