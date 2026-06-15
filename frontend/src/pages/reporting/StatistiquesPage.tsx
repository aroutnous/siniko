import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { StatsChart } from "@/components/reporting/StatsChart";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClassesSelectData } from "@/hooks/useClassesSelectData";
import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import {
  getClasseAbbreviation,
  sortByClasseRefForSelect,
} from "@/lib/etablissement-utils";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import { REPORTING_API } from "@/lib/reporting-api";
import type {
  AnneeScolaire,
  Periode,
  ResultatsClasse,
  StatistiquesGlobales,
  StatsClasseItem,
  StatsCycleItem,
  StatsNiveauItem,
} from "@/types";

export function StatistiquesPage(): React.JSX.Element {
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

  const classeChart = useMemo(
    () =>
      (stats?.eleves.par_classe ?? []).map((c) => ({
        label: c.nom,
        value: c.effectif,
      })),
    [stats],
  );

  const periodeChart = useMemo(
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

  const financePie = useMemo(() => {
    if (!stats) return [];
    const taux = Number(stats.financieres.taux_recouvrement);
    return [
      { label: "Recouvré", value: taux },
      { label: "Restant", value: Math.max(0, 100 - taux) },
    ];
  }, [stats]);

  const financeGrouped = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Année",
        value: Number(stats.financieres.total_recettes),
        value2: Number(stats.financieres.total_depenses),
      },
    ];
  }, [stats]);

  const classeColumns: DataTableColumn<StatsClasseItem & { id: string }>[] = [
    { key: "nom", header: "Classe", render: (r) => r.nom },
    { key: "effectif", header: "Effectif", render: (r) => r.effectif },
  ];

  const niveauColumns: DataTableColumn<StatsNiveauItem & { id: string }>[] = [
    { key: "nom", header: "Niveau", render: (r) => r.nom },
    { key: "effectif", header: "Effectif", render: (r) => r.effectif },
  ];

  const cycleColumns: DataTableColumn<StatsCycleItem & { id: string }>[] = [
    { key: "nom", header: "Cycle", render: (r) => r.nom },
    { key: "effectif", header: "Effectif", render: (r) => r.effectif },
  ];

  return (
    <div className="space-y-6">
      <Select
        value={anneeId}
        onChange={(e) => setAnneeId(e.target.value)}
        className="max-w-[260px]"
      >
        <option value="">Sélectionner une année scolaire</option>
        {annees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.libelle}
          </option>
        ))}
      </Select>

      {!anneeId ? (
        <p className="text-sm text-muted-foreground">
          Choisissez une année pour afficher les statistiques.
        </p>
      ) : isLoading || !stats ? (
        <LoadingSpinner />
      ) : (
        <Tabs defaultValue="eleves">
          <TabsList>
            <TabsTrigger value="eleves">Élèves</TabsTrigger>
            <TabsTrigger value="resultats">Résultats</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
          </TabsList>

          <TabsContent value="eleves" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Effectifs par classe ({stats.eleves.total_eleves} élèves)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatsChart type="bar" data={classeChart} valueLabel="Effectif" />
                <DataTable
                  columns={classeColumns}
                  data={stats.eleves.par_classe.map((c) => ({ ...c, id: c.classe_id }))}
                  page={1}
                  pageSize={stats.eleves.par_classe.length || 1}
                  total={stats.eleves.par_classe.length}
                  onPageChange={() => {}}
                />
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Par niveau</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={niveauColumns}
                    data={stats.eleves.par_niveau.map((n) => ({ ...n, id: n.niveau_id }))}
                    page={1}
                    pageSize={stats.eleves.par_niveau.length || 1}
                    total={stats.eleves.par_niveau.length}
                    onPageChange={() => {}}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Par cycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={cycleColumns}
                    data={stats.eleves.par_cycle.map((c) => ({ ...c, id: c.cycle_id }))}
                    page={1}
                    pageSize={stats.eleves.par_cycle.length || 1}
                    total={stats.eleves.par_cycle.length}
                    onPageChange={() => {}}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="resultats" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  Taux de réussite par période (moy. {Number(stats.resultats.taux_reussite_moyen).toFixed(1)} %)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatsChart type="line" data={periodeChart} valueLabel="Taux %" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Moyennes par matière</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={classeId}
                    onChange={(e) => setClasseId(e.target.value)}
                    className="max-w-[200px]"
                  >
                    <option value="">Classe</option>
                    {parClasseSelect.map((c) => (
                      <option key={c.classe_id} value={c.classe_id}>
                        {getClasseAbbreviation(c.nom)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={periodeId}
                    onChange={(e) => setPeriodeId(e.target.value)}
                    className="max-w-[200px]"
                    disabled={!classeId}
                  >
                    <option value="">Période</option>
                    {periodes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                      </option>
                    ))}
                  </Select>
                </div>
                {classeId && periodeId ? (
                  <StatsChart type="bar" data={matiereChart} valueLabel="Moyenne /20" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez une classe et une période.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Taux de recouvrement</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatsChart type="pie" data={financePie} />
                  <p className="mt-2 text-center text-sm font-medium">
                    {Number(stats.financieres.taux_recouvrement).toFixed(1)} %
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recettes vs dépenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatsChart
                    type="grouped-bar"
                    data={financeGrouped}
                    valueLabel="Recettes"
                    value2Label="Dépenses"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
