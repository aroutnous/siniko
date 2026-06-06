import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { FinanceChart, type FinanceChartDatum } from "@/components/finance/FinanceChart";
import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { ModePaiementBadge } from "@/components/finance/ModePaiementBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API, REPORTING_FINANCE_API } from "@/lib/finance-api";
import type { AnneeScolaire, Eleve, Paiement, SituationFinanciere, TableauBordResponse } from "@/types";

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

export function TableauBordFinancierPage(): React.JSX.Element {
  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
  });

  const { data: tableauBord, isLoading: loadingTb } = useQuery({
    queryKey: ["tableau-bord-finance"],
    queryFn: async () => {
      const { data } = await api.get<TableauBordResponse>(REPORTING_FINANCE_API.tableauBord);
      return data;
    },
  });

  const { data: situation } = useQuery({
    queryKey: ["situation-financiere", anneeActive?.id],
    queryFn: async () => {
      const { data } = await api.get<SituationFinanciere>(FINANCE_API.situation, {
        params: { annee_id: anneeActive!.id },
      });
      return data;
    },
    enabled: Boolean(anneeActive?.id),
  });

  const sixMonthsAgo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 10);
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const { data: transactions = [] } = useQuery({
    queryKey: ["finance-chart", sixMonthsAgo, today],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.transactions, {
        params: { date_debut: sixMonthsAgo, date_fin: today },
      });
      return data;
    },
  });

  const { data: depenses = [] } = useQuery({
    queryKey: ["depenses-chart", sixMonthsAgo, today],
    queryFn: async () => {
      const { data } = await api.get<{ date_depense: string; montant: number }[]>(
        FINANCE_API.depenses,
        { params: { date_debut: sixMonthsAgo, date_fin: today } },
      );
      return data;
    },
  });

  const { data: eleves = [] } = useQuery({
    queryKey: ["eleves-tb"],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list);
      return data;
    },
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );

  const chartData = useMemo((): FinanceChartDatum[] => {
    const buckets = new Map<string, { recettes: number; depenses: number }>();
    for (const t of transactions.filter((x) => x.statut === "valide")) {
      const key = monthKey(t.date_paiement);
      const cur = buckets.get(key) ?? { recettes: 0, depenses: 0 };
      cur.recettes += Number(t.montant_paye);
      buckets.set(key, cur);
    }
    for (const d of depenses) {
      const key = monthKey(d.date_depense);
      const cur = buckets.get(key) ?? { recettes: 0, depenses: 0 };
      cur.depenses += Number(d.montant);
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries()).map(([mois, vals]) => ({
      mois,
      recettes: vals.recettes,
      depenses: vals.depenses,
    }));
  }, [transactions, depenses]);

  const derniersPaiements = useMemo(
    () => [...transactions].slice(0, 5),
    [transactions],
  );

  const kpis = tableauBord?.donnees ?? {};
  const recettesMois = Number(kpis.recettes_semaine ?? kpis.ca_mois ?? situation?.total_recettes ?? 0);
  const depensesMois = Number(kpis.depenses_semaine ?? situation?.total_depenses ?? 0);
  const soldeCaisse = Number(kpis.solde_caisse ?? situation?.solde ?? 0);
  const tauxRecouvrement = Number(kpis.taux_paiement ?? 0);

  if (loadingTb) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FinanceStatCard
          label="Recettes (période)"
          value={`${recettesMois.toLocaleString("fr-FR")} FCFA`}
          color="green"
        />
        <FinanceStatCard
          label="Dépenses (période)"
          value={`${depensesMois.toLocaleString("fr-FR")} FCFA`}
          color="red"
        />
        <FinanceStatCard
          label="Solde caisse"
          value={`${soldeCaisse.toLocaleString("fr-FR")} FCFA`}
          color="blue"
        />
        <FinanceStatCard
          label="Taux recouvrement"
          value={`${tauxRecouvrement.toFixed(1)} %`}
          color="amber"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Évolution recettes / dépenses</CardTitle>
        </CardHeader>
        <CardContent>
          <FinanceChart data={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5 derniers paiements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {derniersPaiements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun paiement récent</p>
          ) : (
            derniersPaiements.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
              >
                <div>
                  <p className="font-medium">{eleveMap.get(p.eleve_id) ?? p.eleve_id}</p>
                  <p className="text-xs text-muted-foreground">{p.date_paiement}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {Number(p.montant_paye).toLocaleString("fr-FR")} FCFA
                  </span>
                  <ModePaiementBadge mode={p.mode_paiement} />
                  <Badge variant={p.statut === "valide" ? "success" : "warning"}>
                    {p.statut}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
