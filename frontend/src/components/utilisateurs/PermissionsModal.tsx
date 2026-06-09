import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, getErrorMessage } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/constants";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  type PermissionKey,
} from "@/lib/permissions";
import { UTILISATEURS_API } from "@/lib/utilisateurs-api";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import type {
  RoleUtilisateur,
  UtilisateurPermissionsResponse,
  UtilisateurPermissionsUpdate,
} from "@/types";

export interface PermissionsModalUser {
  id: string;
  nom: string;
  prenom: string;
  role: RoleUtilisateur;
}

interface PermissionsModalProps {
  open: boolean;
  onClose: () => void;
  user: PermissionsModalUser | null;
  createdMessage?: boolean;
  temporaryPassword?: string | null;
}

export function PermissionsModal({
  open,
  onClose,
  user,
  createdMessage = false,
  temporaryPassword = null,
}: PermissionsModalProps): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const fetchPermissions = useAuthStore((s) => s.fetchPermissions);
  const [selected, setSelected] = useState<PermissionKey[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const userId = user?.id ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["utilisateurs", userId, "permissions"],
    queryFn: async () => {
      const { data: response } = await api.get<UtilisateurPermissionsResponse>(
        UTILISATEURS_API.permissions(userId),
      );
      return response;
    },
    enabled: open && Boolean(userId),
  });

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setShowPassword(false);
      return;
    }
    if (data) {
      setSelected(data.permissions.filter(isPermissionKey));
    }
  }, [open, data]);

  const allSelected = useMemo(
    () => ALL_PERMISSION_KEYS.every((key) => selected.includes(key)),
    [selected],
  );

  const saveMutation = useMutation({
    mutationFn: async (permissions: PermissionKey[]) => {
      const payload: UtilisateurPermissionsUpdate = { permissions };
      const { data: response } = await api.put<UtilisateurPermissionsResponse>(
        UTILISATEURS_API.permissions(userId),
        payload,
      );
      return response;
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["utilisateurs", userId, "permissions"] });
      void queryClient.invalidateQueries({ queryKey: ["utilisateurs"] });
      if (currentUserId === userId) {
        await fetchPermissions();
      }
      toast("Permissions enregistrées");
      onClose();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const togglePermission = (key: PermissionKey, checked: boolean): void => {
    setSelected((current) =>
      checked ? [...current, key] : current.filter((item) => item !== key),
    );
  };

  const toggleAll = (): void => {
    setSelected(allSelected ? [] : [...ALL_PERMISSION_KEYS]);
  };

  const handleCopyPassword = async (): Promise<void> => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      toast("Mot de passe copié");
    } catch {
      toast("Impossible de copier le mot de passe", "error");
    }
  };

  if (!open || !user) return null;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <div className="space-y-4">
        <div>
          <h2 className="pr-8 text-lg font-semibold">
            Permissions de {user.prenom} {user.nom}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>

        {createdMessage ? (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Utilisateur créé. Configurez maintenant ses permissions.
          </p>
        ) : null}

        {temporaryPassword ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">Mot de passe temporaire</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-sm text-amber-950">
                {showPassword ? temporaryPassword : "•".repeat(temporaryPassword.length)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Masquer" : "Afficher"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopyPassword()}
              >
                <Copy className="mr-1 h-4 w-4" />
                Copier
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <LoadingSpinner label="Chargement des permissions…" />
        ) : isError ? (
          <p className="text-sm text-destructive">
            Impossible de charger les permissions de cet utilisateur.
          </p>
        ) : (
          <>
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </Button>
            </div>

            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-5">
                {PERMISSION_GROUPS.map((group) => (
                  <section key={group.title} className="space-y-2">
                    <h3 className="text-sm font-bold">{group.title}</h3>
                    <ul className="space-y-2">
                      {group.permissions.map((permission) => {
                        const inputId = `perm-${user.id}-${permission.key}`;
                        return (
                          <li key={permission.key}>
                            <label
                              htmlFor={inputId}
                              className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-0.5 hover:bg-muted/50"
                            >
                              <Checkbox
                                id={inputId}
                                checked={selected.includes(permission.key)}
                                onCheckedChange={(checked) =>
                                  togglePermission(permission.key, checked)
                                }
                                className="mt-0.5"
                              />
                              <span className="text-sm leading-snug">{permission.label}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saveMutation.isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate(selected)}
            disabled={isLoading || isError || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(value);
}
