import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Repeat, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import { useToastStore } from "@/stores/toastStore";
import type {
  AbonnementCreatePayload,
  AbonnementDetail,
  PlanAbonnement,
  PlatformTenant,
  StatutAbonnement,
} from "@/types";

const PAGE_SIZE = 10;

function statutBadge(statut: StatutAbonnement): React.JSX.Element {
  const map: Record<StatutAbonnement, { label: string; variant: "success" | "destructive" | "muted" | "warning" }> = {
    actif: { label: "ACTIF", variant: "success" },
    expire: { label: "EXPIRÉ", variant: "destructive" },
    resilie: { label: "RÉSILIÉ", variant: "muted" },
    suspendu: { label: "SUSPENDU", variant: "warning" },
  };
  const cfg = map[statut];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function AbonnementsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const [page, setPage] = useState(1);
  const [statutFilter, setStatutFilter] = useState<StatutAbonnement | "">("");
  const [planFilter, setPlanFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<AbonnementDetail | null>(null);
  const [changePlanTarget, setChangePlanTarget] = useState<AbonnementDetail | null>(null);
  const [resilierTarget, setResilierTarget] = useState<AbonnementDetail | null>(null);
  const [dureeMois, setDureeMois] = useState("12");
  const [createForm, setCreateForm] = useState({
    tenant_id: "",
    plan_id: "",
    duree_mois: "12",
  });
  const [newPlanId, setNewPlanId] = useState("");

  const { data: abonnements = [], isLoading } = useQuery({
    queryKey: ["platform-abonnements"],
    queryFn: async () => {
      const { data } = await api.get<AbonnementDetail[]>(PLATFORM_API.abonnements);
      return data;
    },
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: async () => {
      const { data } = await api.get<PlatformTenant[]>(PLATFORM_API.tenants);
      return data;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () => {
      const { data } = await api.get<PlanAbonnement[]>(PLATFORM_API.plans);
      return data;
    },
  });

  const filtered = useMemo(() => {
    return abonnements.filter((a) => {
      if (statutFilter && a.statut !== statutFilter) return false;
      if (planFilter && a.plan_id !== planFilter) return false;
      return true;
    });
  }, [abonnements, statutFilter, planFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["platform-abonnements"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-dashboard"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: AbonnementCreatePayload) => {
      const { data } = await api.post(PLATFORM_API.abonnements, payload);
      return data;
    },
    onSuccess: () => {
      toast("Abonnement créé");
      setCreateOpen(false);
      invalidate();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const renewMutation = useMutation({
    mutationFn: async ({ id, duree }: { id: string; duree: number }) => {
      const { data } = await api.put(PLATFORM_API.abonnementRenouveler(id), {
        duree_mois: duree,
      });
      return data;
    },
    onSuccess: () => {
      toast("Abonnement renouvelé");
      setRenewTarget(null);
      invalidate();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, planId }: { id: string; planId: string }) => {
      const { data } = await api.put(PLATFORM_API.abonnementChangerPlan(id), {
        nouveau_plan_id: planId,
      });
      return data;
    },
    onSuccess: () => {
      toast("Plan modifié");
      setChangePlanTarget(null);
      invalidate();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const resilierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put(PLATFORM_API.abonnementResilier(id));
      return data;
    },
    onSuccess: () => {
      toast("Abonnement résilié");
      setResilierTarget(null);
      invalidate();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<AbonnementDetail>[] = [
    { key: "tenant", header: "Tenant", render: (r) => r.tenant_nom },
    { key: "plan", header: "Plan", render: (r) => r.plan_nom },
    { key: "debut", header: "Début", render: (r) => formatDate(r.date_debut) },
    { key: "fin", header: "Fin", render: (r) => formatDate(r.date_fin) },
    { key: "statut", header: "Statut", render: (r) => statutBadge(r.statut) },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${r.montant} FCFA`,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            title="Renouveler"
            disabled={r.statut === "resilie"}
            onClick={() => {
              setDureeMois("12");
              setRenewTarget(r);
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Changer plan"
            disabled={r.statut === "resilie"}
            onClick={() => {
              setNewPlanId(r.plan_id);
              setChangePlanTarget(r);
            }}
          >
            <Repeat className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Résilier"
            disabled={r.statut === "resilie"}
            onClick={() => setResilierTarget(r)}
          >
            <XCircle className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abonnements"
        description="Gestion des abonnements tenants"
        breadcrumb="Platform Owner"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvel abonnement
          </Button>
        }
      />

      <div className="flex flex-wrap gap-4">
        <Select
          value={statutFilter}
          onChange={(e) => {
            setStatutFilter(e.target.value as StatutAbonnement | "");
            setPage(1);
          }}
          className="max-w-xs"
        >
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="expire">Expiré</option>
          <option value="resilie">Résilié</option>
          <option value="suspendu">Suspendu</option>
        </Select>
        <Select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        >
          <option value="">Tous les plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={paginated}
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
          emptyMessage="Aucun abonnement"
        />
      )}

      <FormModal
        open={createOpen}
        title="Nouvel abonnement"
        onClose={() => setCreateOpen(false)}
        onSubmit={() => {
          createMutation.mutate({
            tenant_id: createForm.tenant_id,
            plan_id: createForm.plan_id,
            duree_mois: Number(createForm.duree_mois),
          });
        }}
        loading={createMutation.isPending}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tenant</Label>
            <Select
              value={createForm.tenant_id}
              onChange={(e) => setCreateForm((p) => ({ ...p, tenant_id: e.target.value }))}
              required
            >
              <option value="">Sélectionner…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select
              value={createForm.plan_id}
              onChange={(e) => setCreateForm((p) => ({ ...p, plan_id: e.target.value }))}
              required
            >
              <option value="">Sélectionner…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Durée (mois)</Label>
            <Input
              type="number"
              min="1"
              max="60"
              value={createForm.duree_mois}
              onChange={(e) => setCreateForm((p) => ({ ...p, duree_mois: e.target.value }))}
              required
            />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={renewTarget !== null}
        title={`Renouveler — ${renewTarget?.tenant_nom ?? ""}`}
        onClose={() => setRenewTarget(null)}
        onSubmit={() => {
          if (renewTarget) {
            renewMutation.mutate({ id: renewTarget.id, duree: Number(dureeMois) });
          }
        }}
        loading={renewMutation.isPending}
        submitLabel="Renouveler"
      >
        <div className="space-y-2">
          <Label>Durée (mois)</Label>
          <Input
            type="number"
            min="1"
            max="60"
            value={dureeMois}
            onChange={(e) => setDureeMois(e.target.value)}
          />
        </div>
      </FormModal>

      <FormModal
        open={changePlanTarget !== null}
        title={`Changer plan — ${changePlanTarget?.tenant_nom ?? ""}`}
        onClose={() => setChangePlanTarget(null)}
        onSubmit={() => {
          if (changePlanTarget && newPlanId) {
            changePlanMutation.mutate({ id: changePlanTarget.id, planId: newPlanId });
          }
        }}
        loading={changePlanMutation.isPending}
        submitLabel="Appliquer"
      >
        <div className="space-y-2">
          <Label>Nouveau plan</Label>
          <Select value={newPlanId} onChange={(e) => setNewPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </Select>
        </div>
      </FormModal>

      <Dialog open={resilierTarget !== null} onClose={() => setResilierTarget(null)}>
        <h2 className="mb-2 pr-8 text-lg font-semibold">Confirmer la résiliation</h2>
        <p className="text-sm text-muted-foreground">
          Résilier l&apos;abonnement de {resilierTarget?.tenant_nom} ({resilierTarget?.plan_nom}) ?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setResilierTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={resilierMutation.isPending}
            onClick={() => {
              if (resilierTarget) resilierMutation.mutate(resilierTarget.id);
            }}
          >
            Résilier
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
