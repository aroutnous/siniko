import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import type { AuditLog, PlatformTenant } from "@/types";

const PAGE_SIZE = 20;

interface Filters {
  date_debut: string;
  date_fin: string;
  action: string;
  tenant_id: string;
  utilisateur_id: string;
}

const INITIAL: Filters = {
  date_debut: "",
  date_fin: "",
  action: "",
  tenant_id: "",
  utilisateur_id: "",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCsv(logs: AuditLog[], tenantNameById: Map<string, string>): void {
  const headers = [
    "Date",
    "Action",
    "Tenant",
    "Utilisateur ID",
    "Table",
    "Résultat",
    "IP",
  ];
  const rows = logs.map((log) =>
    [
      formatDate(log.created_at),
      log.action,
      log.tenant_id ? (tenantNameById.get(log.tenant_id) ?? log.tenant_id) : "—",
      log.utilisateur_id ?? "—",
      log.table_cible ?? "—",
      log.resultat ?? "—",
      log.ip_address ?? "—",
    ]
      .map((cell) => escapeCsv(String(cell)))
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AuditLogsPage(): React.JSX.Element {
  const [draft, setDraft] = useState<Filters>(INITIAL);
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [page, setPage] = useState(1);

  const { data: tenants = [] } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: async () => {
      const { data } = await api.get<PlatformTenant[]>(PLATFORM_API.tenants);
      return data;
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["platform-audit-logs", filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.date_debut) params.date_debut = filters.date_debut;
      if (filters.date_fin) params.date_fin = filters.date_fin;
      if (filters.action.trim()) params.action = filters.action.trim();
      if (filters.tenant_id) params.tenant_id = filters.tenant_id;
      if (filters.utilisateur_id.trim()) params.utilisateur_id = filters.utilisateur_id.trim();
      const { data } = await api.get<AuditLog[]>(PLATFORM_API.auditLogs, { params });
      return data;
    },
  });

  const tenantNameById = useMemo(
    () => new Map(tenants.map((t) => [t.id, t.nom])),
    [tenants],
  );

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return logs.slice(start, start + PAGE_SIZE);
  }, [logs, page]);

  const columns: DataTableColumn<AuditLog>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => formatDate(r.created_at),
    },
    { key: "action", header: "Action", render: (r) => r.action },
    {
      key: "tenant",
      header: "Tenant",
      render: (r) =>
        r.tenant_id ? (tenantNameById.get(r.tenant_id) ?? r.tenant_id.slice(0, 8) + "…") : "—",
    },
    {
      key: "utilisateur",
      header: "Utilisateur",
      render: (r) => (r.utilisateur_id ? r.utilisateur_id.slice(0, 8) + "…" : "—"),
    },
    {
      key: "table",
      header: "Table",
      render: (r) => r.table_cible ?? "—",
    },
    {
      key: "resultat",
      header: "Résultat",
      render: (r) => r.resultat ?? "—",
    },
    {
      key: "ip",
      header: "IP",
      render: (r) => r.ip_address ?? "—",
    },
  ];

  const applyFilters = (): void => {
    setFilters(draft);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        description="Logs cross-tenant de la plateforme"
        breadcrumb="Platform Owner"
        action={
          <Button
            variant="outline"
            onClick={() => exportCsv(logs, tenantNameById)}
            disabled={logs.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Exporter CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="date-debut">Date début</Label>
          <Input
            id="date-debut"
            type="date"
            value={draft.date_debut}
            onChange={(e) => setDraft((p) => ({ ...p, date_debut: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-fin">Date fin</Label>
          <Input
            id="date-fin"
            type="date"
            value={draft.date_fin}
            onChange={(e) => setDraft((p) => ({ ...p, date_fin: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="action">Action</Label>
          <Input
            id="action"
            placeholder="platform.tenant.create"
            value={draft.action}
            onChange={(e) => setDraft((p) => ({ ...p, action: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant-select">Tenant</Label>
          <Select
            id="tenant-select"
            value={draft.tenant_id}
            onChange={(e) => setDraft((p) => ({ ...p, tenant_id: e.target.value }))}
          >
            <option value="">Tous les tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="utilisateur-id">Utilisateur (ID)</Label>
          <Input
            id="utilisateur-id"
            placeholder="UUID utilisateur"
            value={draft.utilisateur_id}
            onChange={(e) => setDraft((p) => ({ ...p, utilisateur_id: e.target.value }))}
          />
        </div>
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button variant="outline" onClick={applyFilters}>
            <Search className="mr-2 h-4 w-4" />
            Filtrer
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={paginated}
          page={page}
          pageSize={PAGE_SIZE}
          total={logs.length}
          onPageChange={setPage}
          emptyMessage="Aucun log pour ces critères"
        />
      )}
    </div>
  );
}
