import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/constants";
import { UTILISATEURS_API } from "@/lib/utilisateurs-api";
import { CreerUtilisateurModal } from "@/pages/utilisateurs/CreerUtilisateurModal";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import type { RoleUtilisateur, StatutUtilisateur, UtilisateurListItem } from "@/types";

const PAGE_SIZE = 10;

function RoleBadge({ role }: { role: RoleUtilisateur }): React.JSX.Element {
  return <Badge variant="default">{ROLE_LABELS[role] ?? role}</Badge>;
}

function StatutBadge({ statut }: { statut: StatutUtilisateur }): React.JSX.Element {
  return (
    <Badge variant={statut === "actif" ? "success" : "muted"}>
      {statut === "actif" ? "Actif" : "Inactif"}
    </Badge>
  );
}

export function UtilisateursListPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState<string | null>(null);

  const { data: utilisateurs = [], isLoading } = useQuery({
    queryKey: ["utilisateurs"],
    queryFn: async () => {
      const { data } = await api.get<UtilisateurListItem[]>(UTILISATEURS_API.list);
      return data;
    },
  });

  const filtered = useMemo(() => {
    return utilisateurs.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statutFilter && u.statut !== statutFilter) return false;
      return true;
    });
  }, [utilisateurs, roleFilter, statutFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const statutMutation = useMutation({
    mutationFn: async ({
      id,
      statut,
    }: {
      id: string;
      statut: StatutUtilisateur;
    }) => {
      setActionId(id);
      const { data } = await api.put<UtilisateurListItem>(
        UTILISATEURS_API.statut(id),
        { statut },
      );
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["utilisateurs"] });
      toast(
        data.statut === "actif"
          ? "Utilisateur réactivé"
          : "Utilisateur désactivé",
      );
      setActionId(null);
    },
    onError: (err) => {
      toast(getErrorMessage(err), "error");
      setActionId(null);
    },
  });

  const columns: DataTableColumn<UtilisateurListItem>[] = [
    { key: "nom", header: "Nom", render: (r) => r.nom },
    { key: "prenom", header: "Prénom", render: (r) => r.prenom },
    { key: "email", header: "Email", render: (r) => r.email },
    {
      key: "role",
      header: "Rôle",
      render: (r) => <RoleBadge role={r.role} />,
    },
    {
      key: "statut",
      header: "Statut",
      render: (r) => <StatutBadge statut={r.statut} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => {
        const isSelf = r.id === currentUserId;
        const isPromoteur = r.role === "promoteur";
        const disabled = isSelf || isPromoteur || actionId === r.id;

        return (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              statutMutation.mutate({
                id: r.id,
                statut: r.statut === "actif" ? "inactif" : "actif",
              })
            }
          >
            {r.statut === "actif" ? "Désactiver" : "Activer"}
          </Button>
        );
      },
    },
  ];

  if (isLoading) {
    return <LoadingSpinner label="Chargement des utilisateurs…" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        description="Gérez les comptes de votre établissement"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Créer un utilisateur
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="w-48"
          aria-label="Filtrer par rôle"
        >
          <option value="">Tous les rôles</option>
          <option value="promoteur">{ROLE_LABELS.promoteur}</option>
          <option value="directeur">{ROLE_LABELS.directeur}</option>
          <option value="secretaire">{ROLE_LABELS.secretaire}</option>
          <option value="comptable">{ROLE_LABELS.comptable}</option>
        </Select>
        <Select
          value={statutFilter}
          onChange={(e) => {
            setStatutFilter(e.target.value);
            setPage(1);
          }}
          className="w-48"
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={paginated}
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
        emptyMessage="Aucun utilisateur"
      />

      <CreerUtilisateurModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["utilisateurs"] })}
      />
    </div>
  );
}
