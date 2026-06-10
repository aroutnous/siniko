import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FormModal } from "@/components/etablissement/FormModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import { useToastStore } from "@/stores/toastStore";
import type {
  FactureCreatePayload,
  FactureDetail,
  PlatformTenant,
  StatutFactureTenant,
} from "@/types";

const PAGE_SIZE = 10;
const MOIS_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

function formatMontant(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

function statutFactureBadge(statut: StatutFactureTenant): React.JSX.Element {
  const map: Record<StatutFactureTenant, { label: string; variant: "success" | "warning" | "muted" }> = {
    payee: { label: "Payée", variant: "success" },
    impayee: { label: "En attente", variant: "warning" },
    annulee: { label: "Annulée", variant: "muted" },
  };
  const cfg = map[statut];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function FacturationPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const currentYear = new Date().getFullYear();
  const [page, setPage] = useState(1);
  const [tenantFilter, setTenantFilter] = useState("");
  const [statutFilter, setStatutFilter] = useState<StatutFactureTenant | "">("");
  const [annee, setAnnee] = useState(String(currentYear));
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    tenant_id: "",
    montant: "",
    description: "",
  });

  const { data: factures = [], isLoading } = useQuery({
    queryKey: ["platform-factures"],
    queryFn: async () => {
      const { data } = await api.get<FactureDetail[]>(PLATFORM_API.factures);
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

  const { data: revenus, isLoading: revenusLoading } = useQuery({
    queryKey: ["platform-revenus", annee],
    queryFn: async () => {
      const { data } = await api.get(PLATFORM_API.facturesRevenus, {
        params: { annee: Number(annee) },
      });
      return data as {
        annee: number;
        mois: { mois: number; revenus: number; nb_factures: number }[];
        total_annuel: number;
      };
    },
  });

  const filtered = useMemo(() => {
    return factures.filter((f) => {
      if (tenantFilter && f.tenant_id !== tenantFilter) return false;
      if (statutFilter && f.statut !== statutFilter) return false;
      return true;
    });
  }, [factures, tenantFilter, statutFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const payMutation = useMutation({
    mutationFn: async (factureId: string) => {
      const { data } = await api.put(PLATFORM_API.facturePayer(factureId));
      return data;
    },
    onSuccess: () => {
      toast("Facture marquée payée");
      void queryClient.invalidateQueries({ queryKey: ["platform-factures"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-revenus"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-dashboard"] });
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: FactureCreatePayload) => {
      const { data } = await api.post(PLATFORM_API.factures, payload);
      return data;
    },
    onSuccess: () => {
      toast("Facture créée");
      setCreateOpen(false);
      setCreateForm({ tenant_id: "", montant: "", description: "" });
      void queryClient.invalidateQueries({ queryKey: ["platform-factures"] });
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const chartData =
    revenus?.mois.map((item) => ({
      mois: MOIS_LABELS[item.mois - 1] ?? String(item.mois),
      revenus: item.revenus,
    })) ?? [];

  const columns: DataTableColumn<FactureDetail>[] = [
    { key: "tenant", header: "Tenant", render: (r) => r.tenant_nom },
    { key: "desc", header: "Description", render: (r) => r.description },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${formatMontant(r.montant)} FCFA`,
    },
    { key: "statut", header: "Statut", render: (r) => statutFactureBadge(r.statut) },
    { key: "date", header: "Échéance", render: (r) => formatDate(r.date_echeance) },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.statut === "impayee" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={payMutation.isPending}
            onClick={() => payMutation.mutate(r.id)}
          >
            <Check className="mr-1 h-4 w-4" />
            Marquer payée
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturation"
        description="Factures et revenus plateforme"
        breadcrumb="Platform Owner"
      />

      <Tabs defaultValue="factures">
        <TabsList>
          <TabsTrigger value="factures">Factures</TabsTrigger>
          <TabsTrigger value="revenus">Revenus</TabsTrigger>
        </TabsList>

        <TabsContent value="factures" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-4">
              <Select
                value={tenantFilter}
                onChange={(e) => {
                  setTenantFilter(e.target.value);
                  setPage(1);
                }}
                className="max-w-xs"
              >
                <option value="">Tous les tenants</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom}
                  </option>
                ))}
              </Select>
              <Select
                value={statutFilter}
                onChange={(e) => {
                  setStatutFilter(e.target.value as StatutFactureTenant | "");
                  setPage(1);
                }}
                className="max-w-xs"
              >
                <option value="">Tous les statuts</option>
                <option value="impayee">En attente</option>
                <option value="payee">Payée</option>
                <option value="annulee">Annulée</option>
              </Select>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle facture
            </Button>
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
              emptyMessage="Aucune facture"
            />
          )}
        </TabsContent>

        <TabsContent value="revenus" className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="annee-revenus">Année</Label>
            <Select
              id="annee-revenus"
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
              className="max-w-[120px]"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
          </div>

          {revenusLoading ? (
            <LoadingSpinner />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Revenus par mois — {annee}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => {
                          const num = typeof value === "number" ? value : Number(value);
                          return [`${formatMontant(num)} FCFA`, "Revenus"];
                        }}
                      />
                      <Bar dataKey="revenus" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-lg font-semibold">
                  Total annuel : {formatMontant(revenus?.total_annuel ?? 0)} FCFA
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <FormModal
        open={createOpen}
        title="Nouvelle facture"
        onClose={() => setCreateOpen(false)}
        onSubmit={() => {
          createMutation.mutate({
            tenant_id: createForm.tenant_id,
            montant: createForm.montant,
            description: createForm.description.trim(),
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
            <Label>Montant (FCFA)</Label>
            <Input
              type="number"
              min="1"
              value={createForm.montant}
              onChange={(e) => setCreateForm((p) => ({ ...p, montant: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={createForm.description}
              onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}
