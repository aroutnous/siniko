import { useQuery } from "@tanstack/react-query";
import { Building2, GraduationCap, Users, Wallet } from "lucide-react";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { api, getErrorMessage } from "@/lib/api";
import type { PlatformStats } from "@/types";

function formatMontant(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export function PlatformDashboardPage(): React.JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const { data: stats } = await api.get<PlatformStats>("/platform/stats");
      return stats;
    },
  });

  return (
    <div>
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Tenants actifs" value={data.nb_tenants} icon={Building2} color="blue" />
          <StatCard
            title="Élèves (total)"
            value={data.nb_eleves_total}
            icon={GraduationCap}
            color="purple"
          />
          <StatCard
            title="Utilisateurs (total)"
            value={data.nb_utilisateurs_total}
            icon={Users}
            color="green"
          />
          <StatCard
            title="Revenus du mois (FCFA)"
            value={formatMontant(data.revenus_mois)}
            icon={Wallet}
            color="orange"
          />
        </div>
      ) : null}
    </div>
  );
}
