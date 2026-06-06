import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FinanceStatCard } from "@/components/finance/FinanceStatCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { FINANCE_API } from "@/lib/finance-api";
import type { CaisseJour } from "@/types";

export function CaissePage(): React.JSX.Element {
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["caisse", targetDate],
    queryFn: async () => {
      const { data: caisse } = await api.get<CaisseJour>(FINANCE_API.caisse, {
        params: { date: targetDate },
      });
      return caisse;
    },
  });

  const fmt = (n: number): string => `${n.toLocaleString("fr-FR")} FCFA`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="date_caisse">Date</Label>
        <Input
          id="date_caisse"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="max-w-[220px]"
        />
      </div>

      {isLoading || !data ? (
        <LoadingSpinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceStatCard
            label="Solde ouverture"
            value={fmt(Number(data.caisse.solde_ouverture))}
            color="blue"
          />
          <FinanceStatCard
            label="Entrées"
            value={fmt(Number(data.caisse.total_entrees))}
            color="green"
          />
          <FinanceStatCard
            label="Sorties"
            value={fmt(Number(data.caisse.total_sorties))}
            color="red"
          />
          <FinanceStatCard
            label="Solde clôture"
            value={fmt(Number(data.caisse.solde_cloture))}
            color="amber"
            trend={`Solde actuel : ${fmt(Number(data.solde_actuel))}`}
          />
        </div>
      )}
    </div>
  );
}
