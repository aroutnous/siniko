import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ModePaiementBadge } from "@/components/finance/ModePaiementBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API } from "@/lib/finance-api";
import type { Eleve, FraisScolaire, Paiement } from "@/types";

export function TransactionsPage(): React.JSX.Element {
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const { data: eleves = [] } = useQuery({
    queryKey: ["eleves-all"],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list);
      return data;
    },
  });

  const { data: frais = [] } = useQuery({
    queryKey: ["frais-all"],
    queryFn: async () => {
      const { data } = await api.get<FraisScolaire[]>(FINANCE_API.frais);
      return data;
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["finance-transactions", dateDebut, dateFin],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dateDebut) params.date_debut = dateDebut;
      if (dateFin) params.date_fin = dateFin;
      const { data } = await api.get<Paiement[]>(FINANCE_API.transactions, { params });
      return data;
    },
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );
  const fraisMap = useMemo(() => new Map(frais.map((f) => [f.id, f.libelle])), [frais]);

  const total = useMemo(
    () => transactions.reduce((sum, t) => sum + Number(t.montant_paye), 0),
    [transactions],
  );

  const columns: DataTableColumn<Paiement>[] = [
    { key: "date", header: "Date", render: (r) => r.date_paiement },
    {
      key: "eleve",
      header: "Élève",
      render: (r) => eleveMap.get(r.eleve_id) ?? r.eleve_id.slice(0, 8),
    },
    {
      key: "frais",
      header: "Frais",
      render: (r) => fraisMap.get(r.frais_id) ?? "—",
    },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${Number(r.montant_paye).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "mode",
      header: "Mode",
      render: (r) => <ModePaiementBadge mode={r.mode_paiement} />,
    },
    {
      key: "ref",
      header: "Référence",
      render: (r) => r.reference_transaction ?? "—",
    },
    {
      key: "statut",
      header: "Statut",
      render: (r) => (
        <Badge variant={r.statut === "valide" ? "success" : "warning"}>
          {r.statut === "valide" ? "Validé" : r.statut === "en_attente" ? "En attente" : r.statut}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label htmlFor="date_debut">Date début</Label>
          <Input
            id="date_debut"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date_fin">Date fin</Label>
          <Input
            id="date_fin"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={transactions}
            page={1}
            pageSize={transactions.length || 1}
            total={transactions.length}
            onPageChange={() => {}}
            emptyMessage="Aucune transaction sur la période"
          />
          <p className="text-right text-sm font-medium">
            Total : {total.toLocaleString("fr-FR")} FCFA
          </p>
        </>
      )}
    </div>
  );
}
