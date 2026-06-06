import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import type { PlatformTenant, StatutTenant } from "@/types";

const PAGE_SIZE = 10;

const STATUT_LABELS: Record<StatutTenant, string> = {
  actif: "Actif",
  suspendu: "Suspendu",
  inactif: "Inactif",
};

export function TenantsListPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statutFilter, setStatutFilter] = useState<StatutTenant | "">("");
  const [error, setError] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["platform-tenants", statutFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statutFilter) params.statut = statutFilter;
      const { data } = await api.get<PlatformTenant[]>("/platform/tenants", { params });
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async ({
      tenantId,
      action,
    }: {
      tenantId: string;
      action: "suspendre" | "activer";
    }) => {
      const { data } = await api.put<PlatformTenant>(
        `/platform/tenants/${tenantId}/${action}`,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return tenants.slice(start, start + PAGE_SIZE);
  }, [tenants, page]);

  const columns: DataTableColumn<PlatformTenant>[] = [
    { key: "nom", header: "Nom", render: (r) => r.nom },
    { key: "slug", header: "Slug", render: (r) => r.slug },
    { key: "email", header: "Email", render: (r) => r.email ?? "—" },
    {
      key: "statut",
      header: "Statut",
      render: (r) => (
        <span
          className={
            r.statut === "actif"
              ? "text-emerald-700"
              : r.statut === "suspendu"
                ? "text-amber-700"
                : "text-muted-foreground"
          }
        >
          {STATUT_LABELS[r.statut]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex gap-2">
          {r.statut === "actif" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ tenantId: r.id, action: "suspendre" })}
            >
              Suspendre
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ tenantId: r.id, action: "activer" })}
            >
              Activer
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Établissements inscrits sur la plateforme"
        breadcrumb="Platform Owner"
        action={
          <Link to={ROUTES.platformTenantsCreate}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau tenant
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Select
          value={statutFilter}
          onChange={(e) => {
            setStatutFilter(e.target.value as StatutTenant | "");
            setPage(1);
          }}
          className="max-w-xs"
        >
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="suspendu">Suspendu</option>
          <option value="inactif">Inactif</option>
        </Select>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={paginated}
          page={page}
          pageSize={PAGE_SIZE}
          total={tenants.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
