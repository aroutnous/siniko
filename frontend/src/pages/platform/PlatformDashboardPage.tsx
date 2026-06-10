import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  GraduationCap,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/StatCard";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import type { DashboardStats, StatistiquesPlateforme } from "@/types";

function formatMontant(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function PlatformDashboardPage(): React.JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-dashboard"],
    queryFn: async () => {
      const { data: stats } = await api.get<DashboardStats>(PLATFORM_API.dashboard);
      return stats;
    },
  });

  const { data: statistiques } = useQuery({
    queryKey: ["platform-statistiques"],
    queryFn: async () => {
      const { data: stats } = await api.get<StatistiquesPlateforme>(
        PLATFORM_API.statistiques,
      );
      return stats;
    },
  });

  const evolutionData =
    statistiques?.evolution_inscriptions.map((item) => ({
      mois: item.mois,
      inscriptions: item.nb,
    })) ?? [];

  const revenusDelta =
    data && data.revenus_mois_precedent > 0
      ? ((data.revenus_mois_courant - data.revenus_mois_precedent) /
          data.revenus_mois_precedent) *
        100
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration plateforme"
        description="Vue d'ensemble cross-tenant"
        breadcrumb="Platform Owner"
      />
      {isLoading ? <LoadingSpinner /> : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-destructive" role="alert">
          {getErrorMessage(error)}
        </p>
      ) : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Tenants actifs"
              value={data.nb_tenants_actifs}
              icon={Building2}
              color="blue"
            />
            <StatCard
              title="Tenants suspendus"
              value={data.nb_tenants_suspendus}
              icon={Building2}
              color="orange"
            />
            <StatCard
              title="Élèves (total)"
              value={data.nb_eleves_total}
              icon={GraduationCap}
              color="purple"
            />
            <StatCard
              title="Nouveaux tenants (mois)"
              value={data.nouveaux_tenants_mois}
              icon={UserPlus}
              color="green"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  Revenus du mois
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatMontant(data.revenus_mois_courant)} FCFA</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mois précédent : {formatMontant(data.revenus_mois_precedent)} FCFA
                </p>
                {revenusDelta !== null ? (
                  <p
                    className={`mt-2 flex items-center gap-1 text-sm font-medium ${
                      revenusDelta >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {revenusDelta >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {revenusDelta >= 0 ? "+" : ""}
                    {revenusDelta.toFixed(1)} % vs mois précédent
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Évolution inscriptions tenants</CardTitle>
              </CardHeader>
              <CardContent>
                {evolutionData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune donnée</p>
                ) : (
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={evolutionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="inscriptions"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Abonnements expirant sous 7 jours
                  {data.abonnements_expirant_7j.length > 0 ? (
                    <Badge variant="warning">{data.abonnements_expirant_7j.length}</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.abonnements_expirant_7j.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun abonnement à échéance proche</p>
                ) : (
                  <ul className="space-y-2">
                    {data.abonnements_expirant_7j.map((item) => (
                      <li
                        key={item.abonnement_id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{item.tenant_nom}</span>
                          <span className="text-muted-foreground"> — {item.plan_nom}</span>
                        </span>
                        <Badge variant="warning">{formatDate(item.date_fin)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  Tenants sans paiement récent
                  {data.tenants_sans_paiement.length > 0 ? (
                    <Badge variant="destructive">{data.tenants_sans_paiement.length}</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.tenants_sans_paiement.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tous les tenants sont à jour</p>
                ) : (
                  <ul className="space-y-2">
                    {data.tenants_sans_paiement.map((item) => (
                      <li
                        key={item.tenant_id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{item.tenant_nom}</span>
                        <Badge variant="destructive">
                          {item.jours_sans_paiement >= 999
                            ? "Jamais payé"
                            : `${item.jours_sans_paiement} j`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
