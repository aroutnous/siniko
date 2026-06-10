import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import { useToastStore } from "@/stores/toastStore";
import type { NotificationCreatePayload, NotificationDetail, PlatformTenant } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR");
}

export function NotificationsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const [cible, setCible] = useState<"tous" | "tenant">("tous");
  const [tenantId, setTenantId] = useState("");
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["platform-notifications"],
    queryFn: async () => {
      const { data } = await api.get<NotificationDetail[]>(PLATFORM_API.notifications);
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

  const sendMutation = useMutation({
    mutationFn: async (payload: NotificationCreatePayload) => {
      if (cible === "tous") {
        const { data } = await api.post(PLATFORM_API.notificationsTous, payload);
        return data;
      }
      const { data } = await api.post(
        PLATFORM_API.notificationsTenant(tenantId),
        payload,
      );
      return data;
    },
    onSuccess: () => {
      toast("Notification envoyée");
      setTitre("");
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["platform-notifications"] });
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<NotificationDetail>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => formatDate(r.created_at),
    },
    {
      key: "cible",
      header: "Cible",
      render: (r) => (r.cible === "tous" ? "Tous les tenants" : r.tenant_nom ?? "Tenant"),
    },
    { key: "titre", header: "Titre", render: (r) => r.titre },
    {
      key: "emetteur",
      header: "Expéditeur",
      render: (r) => r.emetteur_nom ?? "—",
    },
  ];

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (cible === "tenant" && !tenantId) {
      toast("Sélectionnez un tenant", "error");
      return;
    }
    sendMutation.mutate({ titre: titre.trim(), message: message.trim() });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Envoi et historique des notifications plateforme"
        breadcrumb="Platform Owner"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Envoyer une notification</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Cible</Label>
              <Select
                value={cible}
                onChange={(e) => setCible(e.target.value as "tous" | "tenant")}
              >
                <option value="tous">Tous les tenants</option>
                <option value="tenant">Tenant spécifique</option>
              </Select>
            </div>
            {cible === "tenant" ? (
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  <option value="">Sélectionner…</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nom}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="notif-titre">Titre</Label>
              <Input
                id="notif-titre"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-message">Message</Label>
              <textarea
                id="notif-message"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={sendMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              {sendMutation.isPending ? "Envoi…" : "Envoyer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Historique</h2>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <DataTable
            columns={columns}
            data={notifications}
            page={1}
            pageSize={notifications.length || 10}
            total={notifications.length}
            onPageChange={() => undefined}
            emptyMessage="Aucune notification envoyée"
          />
        )}
      </div>
    </div>
  );
}
