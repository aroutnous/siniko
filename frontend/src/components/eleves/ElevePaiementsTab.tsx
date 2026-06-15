import { useQuery } from "@tanstack/react-query";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { FINANCE_API } from "@/lib/finance-api";
import type { FraisScolaire, Paiement, SituationEleve } from "@/types";

const MODE_LABELS: Record<Paiement["mode_paiement"], string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  virement: "Virement",
  cheque: "Chèque",
};

const STATUT_LABELS: Record<Paiement["statut"], string> = {
  en_attente: "En attente",
  valide: "Validé",
  annule: "Annulé",
};

interface ElevePaiementsTabProps {
  eleveId: string;
  anneeId?: string;
}

export function ElevePaiementsTab({
  eleveId,
  anneeId,
}: ElevePaiementsTabProps): React.JSX.Element {
  const { data: frais = [] } = useQuery({
    queryKey: ["frais-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<FraisScolaire[]>(FINANCE_API.frais);
      return data;
    },
  });

  const fraisMap = new Map(frais.map((f) => [f.id, f.libelle]));

  const { data: paiements = [], isLoading: loadingPaiements } = useQuery({
    queryKey: ["paiements-eleve", eleveId],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.recusEleve(eleveId));
      return data;
    },
  });

  const { data: situation, isLoading: loadingSituation } = useQuery({
    queryKey: ["situation-eleve", eleveId, anneeId],
    queryFn: async () => {
      const { data } = await api.get<SituationEleve>(FINANCE_API.situationEleve(eleveId), {
        params: { annee_id: anneeId },
      });
      return data;
    },
    enabled: Boolean(anneeId),
  });

  const columns: DataTableColumn<Paiement>[] = [
    { key: "date", header: "Date", render: (r) => r.date_paiement },
    {
      key: "libelle",
      header: "Libellé frais",
      render: (r) => fraisMap.get(r.frais_id) ?? "Frais",
    },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${Number(r.montant_paye).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "mode",
      header: "Mode",
      render: (r) => MODE_LABELS[r.mode_paiement],
    },
    {
      key: "statut",
      header: "Statut",
      render: (r) => (
        <Badge variant={r.statut === "valide" ? "success" : "muted"}>
          {STATUT_LABELS[r.statut]}
        </Badge>
      ),
    },
  ];

  if (loadingPaiements || (anneeId && loadingSituation)) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {situation ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total dû
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {Number(situation.total_du).toLocaleString("fr-FR")} FCFA
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total payé
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-700">
                {Number(situation.total_paye).toLocaleString("fr-FR")} FCFA
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Reste à payer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">
                {Number(situation.reste_a_payer).toLocaleString("fr-FR")} FCFA
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune année scolaire active pour afficher la situation financière.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historique des paiements</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={paiements}
            page={1}
            pageSize={paiements.length || 1}
            total={paiements.length}
            onPageChange={() => undefined}
            emptyMessage="Aucun paiement enregistré"
          />
        </CardContent>
      </Card>
    </div>
  );
}
