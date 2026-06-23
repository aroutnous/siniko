import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  CreditCard,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { useHasPermission } from "@/hooks/useHasPermission";
import type { TableauBordResponse } from "@/types";

function formatKpiValue(value: number | string): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

const KPI_CONFIG: Record<
  string,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    color: "blue" | "green" | "orange" | "purple";
    permissions: string[];
  }
> = {
  nb_eleves: {
    title: "Élèves inscrits",
    icon: Users,
    color: "blue",
    permissions: ["eleves.consulter"],
  },
  nb_classes: {
    title: "Classes",
    icon: BookOpen,
    color: "purple",
    permissions: ["classes.consulter"],
  },
  taux_paiement: {
    title: "Taux de paiement (%)",
    icon: CreditCard,
    color: "green",
    permissions: ["paiements.consulter", "statistiques.finance"],
  },
  ca_mois: {
    title: "CA du mois (FCFA)",
    icon: Wallet,
    color: "orange",
    permissions: ["paiements.consulter", "statistiques.finance"],
  },
  taux_reussite: {
    title: "Taux de réussite (%)",
    icon: TrendingUp,
    color: "green",
    permissions: ["statistiques.pedagogie", "notes.consulter"],
  },
  nb_bulletins_valides: {
    title: "Bulletins validés",
    icon: Award,
    color: "blue",
    permissions: ["bulletins.generer", "bulletins.valider"],
  },
  nb_absences: {
    title: "Absences",
    icon: Users,
    color: "orange",
    permissions: ["absences.consulter"],
  },
  inscriptions_jour: {
    title: "Inscriptions aujourd'hui",
    icon: Users,
    color: "blue",
    permissions: ["eleves.inscrire", "eleves.consulter"],
  },
  paiements_jour: {
    title: "Paiements aujourd'hui",
    icon: Wallet,
    color: "green",
    permissions: ["paiements.consulter", "paiements.enregistrer"],
  },
  recettes_semaine: {
    title: "Recettes semaine (FCFA)",
    icon: Wallet,
    color: "green",
    permissions: ["paiements.consulter", "statistiques.finance"],
  },
  depenses_semaine: {
    title: "Dépenses semaine (FCFA)",
    icon: CreditCard,
    color: "orange",
    permissions: ["depenses.consulter", "statistiques.finance"],
  },
  solde_caisse: {
    title: "Solde caisse (FCFA)",
    icon: Wallet,
    color: "purple",
    permissions: ["caisse.consulter", "statistiques.finance"],
  },
};

export function DashboardPage(): React.JSX.Element {
  const hasPermission = useHasPermission();

  const canFetchDashboard =
    hasPermission("rapports.financiers") ||
    hasPermission("statistiques.pedagogie") ||
    hasPermission("statistiques.finance");

  const { data, isLoading } = useQuery({
    queryKey: ["tableau-bord", "dashboard"],
    queryFn: async () => {
      const { data: response } = await api.get<TableauBordResponse>("/reporting/tableau-bord");
      return response;
    },
    enabled: canFetchDashboard,
    retry: false,
  });

  const visibleKpis = data
    ? Object.entries(data.donnees as Record<string, number | string>).filter(([key]) => {
        const meta = KPI_CONFIG[key];
        if (!meta) return false;
        return meta.permissions.some((permission) => hasPermission(permission));
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description="Indicateurs clés selon vos permissions"
        breadcrumb="Accueil"
      />
      {isLoading ? <LoadingSpinner /> : null}
      {!canFetchDashboard ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Bienvenue sur KALANKO. Utilisez le menu pour accéder aux modules autorisés.
        </p>
      ) : null}
      {visibleKpis.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleKpis.map(([key, value]) => {
            const meta = KPI_CONFIG[key] ?? {
              title: key,
              icon: TrendingUp,
              color: "blue" as const,
              permissions: [],
            };
            return (
              <StatCard
                key={key}
                title={meta.title}
                value={formatKpiValue(value)}
                icon={meta.icon}
                color={meta.color}
              />
            );
          })}
        </div>
      ) : canFetchDashboard && !isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Aucun indicateur disponible pour vos permissions actuelles.
        </p>
      ) : null}
    </div>
  );
}
