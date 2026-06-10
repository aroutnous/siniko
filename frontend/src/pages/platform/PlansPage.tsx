import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import { PlanEditModal } from "@/pages/platform/PlanEditModal";
import { useToastStore } from "@/stores/toastStore";
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
  const toast = useToastStore((s) => s.show);
  const [form, setForm] = useState<PlanForm>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<PlanAbonnement | null>(null);
  const [deletePlan, setDeletePlan] = useState<PlanAbonnement | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () => {
      const { data } = await api.get<PlanAbonnement[]>(PLATFORM_API.plans);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: PlanCreatePayload) => {
      const { data } = await api.post<PlanAbonnement>(PLATFORM_API.plans, payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
      setForm(INITIAL);
      setError(null);
      toast("Plan créé");
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (planId: string) => {
      await api.delete(PLATFORM_API.plan(planId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
      toast("Plan supprimé");
      setDeletePlan(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
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
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Modifier"
            onClick={() => setEditPlan(r)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Supprimer"
            onClick={() => setDeletePlan(r)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
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
    createMutation.mutate(payload);
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Création…" : "Créer le plan"}
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

      <PlanEditModal
        open={editPlan !== null}
        plan={editPlan}
        onClose={() => setEditPlan(null)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
        }}
      />

      <Dialog open={deletePlan !== null} onClose={() => setDeletePlan(null)}>
        <h2 className="mb-2 pr-8 text-lg font-semibold">Confirmer la suppression</h2>
        <p className="text-sm text-muted-foreground">
          Supprimer le plan {deletePlan?.nom} ? Les abonnements associés seront également
          supprimés. Cette action est irréversible.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeletePlan(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (deletePlan) deleteMutation.mutate(deletePlan.id);
            }}
          >
            {deleteMutation.isPending ? "Suppression…" : "Supprimer"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
