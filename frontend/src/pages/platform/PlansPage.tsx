import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getErrorMessage } from "@/lib/api";
import type { PlanAbonnement, PlanCreatePayload } from "@/types";

interface PlanForm {
  nom: string;
  prix_mensuel: string;
  max_eleves: string;
  max_utilisateurs: string;
}

const INITIAL: PlanForm = {
  nom: "",
  prix_mensuel: "",
  max_eleves: "",
  max_utilisateurs: "",
};

export function PlansPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanForm>(INITIAL);
  const [error, setError] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () => {
      const { data } = await api.get<PlanAbonnement[]>("/platform/plans");
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: PlanCreatePayload) => {
      const { data } = await api.post<PlanAbonnement>("/platform/plans", payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
      setForm(INITIAL);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const columns: DataTableColumn<PlanAbonnement>[] = [
    { key: "nom", header: "Nom", render: (r) => r.nom },
    {
      key: "prix",
      header: "Prix mensuel",
      render: (r) => `${r.prix_mensuel} FCFA`,
    },
    {
      key: "eleves",
      header: "Max élèves",
      render: (r) => (r.max_eleves != null ? String(r.max_eleves) : "∞"),
    },
    {
      key: "users",
      header: "Max utilisateurs",
      render: (r) => (r.max_utilisateurs != null ? String(r.max_utilisateurs) : "∞"),
    },
    {
      key: "actif",
      header: "Actif",
      render: (r) => (r.est_actif ? "Oui" : "Non"),
    },
  ];

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const payload: PlanCreatePayload = {
      nom: form.nom.trim(),
      prix_mensuel: form.prix_mensuel,
      fonctionnalites: {},
    };
    if (form.max_eleves) payload.max_eleves = Number(form.max_eleves);
    if (form.max_utilisateurs) payload.max_utilisateurs = Number(form.max_utilisateurs);
    mutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans d'abonnement"
        description="Offres commerciales de la plateforme"
        breadcrumb="Platform Owner"
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Nouveau plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-nom">Nom *</Label>
              <Input
                id="plan-nom"
                value={form.nom}
                onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-prix">Prix mensuel (FCFA) *</Label>
              <Input
                id="plan-prix"
                type="number"
                min="1"
                value={form.prix_mensuel}
                onChange={(e) => setForm((p) => ({ ...p, prix_mensuel: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-eleves">Max élèves</Label>
              <Input
                id="plan-eleves"
                type="number"
                min="1"
                value={form.max_eleves}
                onChange={(e) => setForm((p) => ({ ...p, max_eleves: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-users">Max utilisateurs</Label>
              <Input
                id="plan-users"
                type="number"
                min="1"
                value={form.max_utilisateurs}
                onChange={(e) => setForm((p) => ({ ...p, max_utilisateurs: e.target.value }))}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Création…" : "Créer le plan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={plans}
          page={1}
          pageSize={plans.length || 10}
          total={plans.length}
          onPageChange={() => undefined}
          emptyMessage="Aucun plan configuré"
        />
      )}
    </div>
  );
}
