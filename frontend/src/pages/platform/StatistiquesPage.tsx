import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import type { StatistiquesPlateforme } from "@/types";

const PIE_COLORS = [
  "hsl(var(--primary))",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ef4444",
];

export function StatistiquesPage(): React.JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-statistiques"],
    queryFn: async () => {
      const { data: stats } = await api.get<StatistiquesPlateforme>(
        PLATFORM_API.statistiques,
      );
      return stats;
    },
  });

  const repartitionData = data?.repartition_par_plan ?? [];
  const evolutionData =
    data?.evolution_inscriptions.map((item) => ({
      mois: item.mois,
      inscriptions: item.nb,
    })) ?? [];
  const topTenantsData = data?.top_tenants_actifs ?? [];
  const modulesData = Object.entries(data?.taux_utilisation_modules ?? {}).map(
    ([module, count]) => ({ module, count }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiques"
        description="Analyses globales de la plateforme"
        breadcrumb="Platform Owner"
      />
      {isLoading ? <LoadingSpinner /> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(error)}
        </p>
      ) : null}
      {data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Répartition tenants par plan</CardTitle>
            </CardHeader>
            <CardContent>
              {repartitionData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune donnée</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={repartitionData}
                        dataKey="nb_tenants"
                        nameKey="plan"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(props) => {
                          const name = String(props.name ?? "");
                          const value = typeof props.value === "number" ? props.value : 0;
                          return `${name}: ${value}`;
                        }}
                      >
                        {repartitionData.map((_, index) => (
                          <Cell
                            key={repartitionData[index].plan}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Évolution inscriptions (12 mois)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evolutionData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="inscriptions"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 5 tenants par nb élèves</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topTenantsData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 80, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="tenant"
                      tick={{ fontSize: 11 }}
                      width={75}
                    />
                    <Tooltip />
                    <Bar dataKey="nb_eleves" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Taux d&apos;utilisation modules</CardTitle>
            </CardHeader>
            <CardContent>
              {modulesData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun module configuré</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modulesData} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="module"
                        tick={{ fontSize: 11 }}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
