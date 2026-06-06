import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getErrorMessage } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/constants";
import { UTILISATEURS_API } from "@/lib/utilisateurs-api";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import type { ChangePasswordPayload } from "@/types";

const INITIAL_PASSWORD: ChangePasswordPayload = {
  ancien_mot_de_passe: "",
  nouveau_mot_de_passe: "",
  confirmation: "",
};

export function ProfilPage(): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const user = useAuthStore((s) => s.user);
  const [passwordForm, setPasswordForm] = useState<ChangePasswordPayload>(INITIAL_PASSWORD);

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (passwordForm.nouveau_mot_de_passe !== passwordForm.confirmation) {
        throw new Error("La confirmation ne correspond pas");
      }
      await api.post(UTILISATEURS_API.changePassword, passwordForm);
    },
    onSuccess: () => {
      toast("Mot de passe modifié");
      setPasswordForm(INITIAL_PASSWORD);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  if (!user) {
    return <LoadingSpinner label="Chargement du profil…" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Mon profil"
        description="Informations personnelles et sécurité du compte"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Nom</p>
            <p className="font-medium">{user.nom}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Prénom</p>
            <p className="font-medium">{user.prenom}</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Rôle</p>
            <Badge>{ROLE_LABELS[user.role] ?? user.role}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Statut</p>
            <Badge variant={user.statut === "actif" ? "success" : "muted"}>
              {user.statut === "actif" ? "Actif" : "Inactif"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Changer le mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              changePasswordMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="ancien-mdp">Mot de passe actuel</Label>
              <Input
                id="ancien-mdp"
                type="password"
                value={passwordForm.ancien_mot_de_passe}
                onChange={(e) =>
                  setPasswordForm((f) => ({
                    ...f,
                    ancien_mot_de_passe: e.target.value,
                  }))
                }
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nouveau-mdp">Nouveau mot de passe</Label>
              <Input
                id="nouveau-mdp"
                type="password"
                value={passwordForm.nouveau_mot_de_passe}
                onChange={(e) =>
                  setPasswordForm((f) => ({
                    ...f,
                    nouveau_mot_de_passe: e.target.value,
                  }))
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation-mdp">Confirmation</Label>
              <Input
                id="confirmation-mdp"
                type="password"
                value={passwordForm.confirmation}
                onChange={(e) =>
                  setPasswordForm((f) => ({
                    ...f,
                    confirmation: e.target.value,
                  }))
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending
                ? "Modification…"
                : "Modifier le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
