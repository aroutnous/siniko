import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { FinanceChart, type FinanceChartDatum } from "@/components/finance/FinanceChart";
import { KpiGrid, type KpiItem } from "@/components/reporting/KpiGrid";
import { StatsChart } from "@/components/reporting/StatsChart";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useClassesSelectData } from "@/hooks/useClassesSelectData";
import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import {
  getClasseAbbreviation,
  sortByClasseRefForSelect,
} from "@/lib/etablissement-utils";
import { FINANCE_API } from "@/lib/finance-api";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import { REPORTING_API } from "@/lib/reporting-api";
import type {
  AnneeScolaire,
  Paiement,
  Periode,
  ResultatsClasse,
  SituationFinanciere,
  StatistiquesGlobales,
  TableauBordResponse,
} from "@/types";

function monthKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
}

export function RapportsPage(): React.JSX.Element {
  const hasPermission = useHasPermission();

  const canPedagogie = hasPermission("statistiques.pedagogie");
  const canFinance = hasPermission("statistiques.finance");
  const canRapportsFin = hasPermission("rapports.financiers");

  const tabs = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    if (canPedagogie) list.push({ id: "pedagogie", label: "Stats pédagogiques" });
    if (canFinance) list.push({ id: "finance", label: "Stats financières" });
    if (canRapportsFin) list.push({ id: "rapports", label: "Rapports financiers" });
    return list;
  }, [canPedagogie, canFinance, canRapportsFin]);

  if (tabs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Vous n&apos;avez pas accès aux rapports.
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rapports & Statistiques"
        description="Indicateurs pédagogiques et financiers de l'établissement"
      />
      <Tabs defaultValue={tabs[0]?.id ?? "pedagogie"}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {canPedagogie ? (
          <TabsContent value="pedagogie">
            <StatsPedagogiquesTab />
          </TabsContent>
        ) : null}
        {canFinance ? (
          <TabsContent value="finance">
            <StatsFinancieresTab />
          </TabsContent>
        ) : null}
        {canRapportsFin ? (
          <TabsContent value="rapports">
            <RapportsFinanciersTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function StatsPedagogiquesTab(): React.JSX.Element {
  const [anneeId, setAnneeId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { classesMap, cyclesMap } = useClassesSelectData();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["statistiques", anneeId],
    queryFn: async () => {
      const { data } = await api.get<StatistiquesGlobales>(REPORTING_API.statistiques, {
        params: { annee_id: anneeId },
      });
      return data;
    },
    enabled: Boolean(anneeId),
  });

  const { data: resultatsClasse } = useQuery({
    queryKey: ["stats-resultats-classe", classeId, periodeId],
    queryFn: async () => {
      const { data } = await api.get<ResultatsClasse>(
        PEDAGOGIE_API.resultatsClasse(classeId),
        { params: { periode_id: periodeId } },
      );
      return data;
    },
    enabled: Boolean(classeId && periodeId),
  });

  const parClasseSelect = useMemo(
    () =>
      sortByClasseRefForSelect(stats?.eleves.par_classe ?? [], classesMap, cyclesMap),
    [stats, classesMap, cyclesMap],
  );

  const tauxChart = useMemo(
    () =>
      (stats?.resultats.par_periode ?? []).map((p) => ({
        label: p.nom,
        value: Number(p.taux_reussite_moyen),
      })),
    [stats],
  );

  const matiereChart = useMemo(
    () =>
      (resultatsClasse?.moyennes_par_matiere ?? []).map((m) => ({
        label: m.matiere_id.slice(0, 8),
        value: Number(m.moyenne),
      })),
    [resultatsClasse],
  );

  const classeChart = useMemo(
    () =>
      (stats?.eleves.par_classe ?? []).map((c) => ({
        label: c.nom,
        value: c.effectif,
      })),
    [stats],
  );

  return (
    <div className="space-y-6">
      <Select
        value={anneeId}
        onChange={(e) => setAnneeId(e.target.value)}
        className="max-w-xs"
      >
        <option value="">Année scolaire</option>
        {annees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.libelle}
          </option>
        ))}
      </Select>

      {!anneeId ? (
        <p className="text-sm text-muted-foreground">
          Sélectionnez une année pour afficher les statistiques.
        </p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Taux de réussite moyen</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {Number(stats.resultats.taux_reussite_moyen).toFixed(1)} %
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Élèves inscrits</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {stats.eleves.total_eleves}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classes</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {stats.eleves.par_classe.length}
              </CardContent>
            </Card>
          </div>

          {tauxChart.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Taux de réussite par période</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsChart type="bar" data={tauxChart} valueLabel="Taux %" />
              </CardContent>
            </Card>
          ) : null}

          {classeChart.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Effectifs par classe</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsChart type="bar" data={classeChart} />
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-4">
            <Select
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Classe (moyennes)</option>
              {parClasseSelect.map((c) => (
                <option key={c.classe_id} value={c.classe_id}>
                  {getClasseAbbreviation(c.nom)}
                </option>
              ))}
            </Select>
            <Select
              value={periodeId}
              onChange={(e) => setPeriodeId(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Période</option>
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </Select>
          </div>

          {matiereChart.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Moyennes par matière</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsChart type="bar" data={matiereChart} valueLabel="Moyenne" />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StatsFinancieresTab(): React.JSX.Element {
  const [anneeId, setAnneeId] = useState("");

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["statistiques-finance", anneeId],
    queryFn: async () => {
      const { data } = await api.get<StatistiquesGlobales>(REPORTING_API.statistiques, {
        params: { annee_id: anneeId },
      });
      return data;
    },
    enabled: Boolean(anneeId),
  });

  const sixMonthsAgo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 10);
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const { data: transactions = [] } = useQuery({
    queryKey: ["rapports-transactions", sixMonthsAgo],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.transactions, {
        params: { date_debut: sixMonthsAgo, date_fin: today },
      });
      return data;
    },
  });

  const { data: depenses = [] } = useQuery({
    queryKey: ["rapports-depenses", sixMonthsAgo],
    queryFn: async () => {
      const { data } = await api.get<{ date_depense: string; montant: number }[]>(
        FINANCE_API.depenses,
        { params: { date_debut: sixMonthsAgo, date_fin: today } },
      );
      return data;
    },
  });

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

  const recouvrementPie = useMemo(() => {
    if (!stats) return [];
    const taux = Number(stats.financieres.taux_recouvrement);
    return [
      { label: "Recouvré", value: taux },
      { label: "Restant", value: Math.max(0, 100 - taux) },
    ];
  }, [stats]);

  return (
    <div className="space-y-6">
      <Select
        value={anneeId}
        onChange={(e) => setAnneeId(e.target.value)}
        className="max-w-xs"
      >
        <option value="">Année scolaire</option>
        {annees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.libelle}
          </option>
        ))}
      </Select>

      {!anneeId ? (
        <p className="text-sm text-muted-foreground">Sélectionnez une année scolaire.</p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recettes</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {Number(stats.financieres.total_recettes).toLocaleString("fr-FR")} FCFA
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dépenses</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {Number(stats.financieres.total_depenses).toLocaleString("fr-FR")} FCFA
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Taux de recouvrement</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {Number(stats.financieres.taux_recouvrement).toFixed(1)} %
              </CardContent>
            </Card>
          </div>

          {chartData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recettes vs dépenses (6 mois)</CardTitle>
              </CardHeader>
              <CardContent>
                <FinanceChart data={chartData} />
              </CardContent>
            </Card>
          ) : null}

          {recouvrementPie.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Taux de recouvrement</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsChart type="pie" data={recouvrementPie} />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RapportsFinanciersTab(): React.JSX.Element {
  const { data: tableauBord, isLoading: loadingTb } = useQuery({
    queryKey: ["reporting-tableau-bord"],
    queryFn: async () => {
      const { data } = await api.get<TableauBordResponse>(REPORTING_API.tableauBord);
      return data;
    },
  });

  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
  });

  const { data: situation, isLoading: loadingSit } = useQuery({
    queryKey: ["situation-financiere", anneeActive?.id],
    queryFn: async () => {
      const { data } = await api.get<SituationFinanciere>(FINANCE_API.situation, {
        params: { annee_id: anneeActive!.id },
      });
      return data;
    },
    enabled: Boolean(anneeActive?.id),
  });

  const kpis = useMemo((): KpiItem[] => {
    if (!tableauBord) return [];
    const d = tableauBord.donnees;
    const items: KpiItem[] = [];
    if (typeof d.total_recettes === "number") {
      items.push({
        label: "Recettes",
        value: `${d.total_recettes.toLocaleString("fr-FR")} FCFA`,
        color: "green",
      });
    }
    if (typeof d.total_impayes === "number") {
      items.push({
        label: "Impayés",
        value: `${d.total_impayes.toLocaleString("fr-FR")} FCFA`,
        color: "red",
      });
    }
    if (typeof d.nb_paiements_jour === "number") {
      items.push({
        label: "Paiements du jour",
        value: String(d.nb_paiements_jour),
        color: "blue",
      });
    }
    return items;
  }, [tableauBord]);

  if (loadingTb) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {kpis.length > 0 ? <KpiGrid items={kpis} /> : null}

      {loadingSit ? (
        <LoadingSpinner />
      ) : situation ? (
        <Card>
          <CardHeader>
            <CardTitle>Situation financière globale</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Recettes</p>
              <p className="text-lg font-semibold">
                {Number(situation.total_recettes).toLocaleString("fr-FR")} FCFA
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Dépenses</p>
              <p className="text-lg font-semibold">
                {Number(situation.total_depenses).toLocaleString("fr-FR")} FCFA
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Salaires</p>
              <p className="text-lg font-semibold">
                {Number(situation.total_salaires).toLocaleString("fr-FR")} FCFA
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Solde</p>
              <p
                className={`text-lg font-semibold ${
                  situation.solde >= 0 ? "text-green-600" : "text-destructive"
                }`}
              >
                {Number(situation.solde).toLocaleString("fr-FR")} FCFA
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune année active pour le récapitulatif.
        </p>
      )}
    </div>
  );
}
