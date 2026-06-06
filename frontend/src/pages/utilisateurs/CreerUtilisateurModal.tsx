import { useMutation } from "@tanstack/react-query";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/constants";
import { ROLES_CREATABLE, UTILISATEURS_API } from "@/lib/utilisateurs-api";
import { useToastStore } from "@/stores/toastStore";
import type { UtilisateurCreatePayload, UtilisateurCreateResponse } from "@/types";

interface CreerUtilisateurModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const INITIAL_FORM: UtilisateurCreatePayload = {
  nom: "",
  prenom: "",
  email: "",
  role: "directeur",
  mot_de_passe: "",
};

export function CreerUtilisateurModal({
  open,
  onClose,
  onCreated,
}: CreerUtilisateurModalProps): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [form, setForm] = useState<UtilisateurCreatePayload>(INITIAL_FORM);
  const [createdUser, setCreatedUser] = useState<UtilisateurCreateResponse | null>(
    null,
  );
  const [showPassword, setShowPassword] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: UtilisateurCreatePayload = {
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
      };
      if (form.mot_de_passe?.trim()) {
        payload.mot_de_passe = form.mot_de_passe.trim();
      }
      const { data } = await api.post<UtilisateurCreateResponse>(
        UTILISATEURS_API.create,
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      onCreated();
      if (data.mot_de_passe_temporaire) {
        setCreatedUser(data);
        toast("Utilisateur créé — copiez le mot de passe temporaire");
        return;
      }
      toast("Utilisateur créé");
      setForm(INITIAL_FORM);
      setCreatedUser(null);
      onClose();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const handleClose = (): void => {
    setForm(INITIAL_FORM);
    setCreatedUser(null);
    setShowPassword(false);
    onClose();
  };

  const handleCopyPassword = async (): Promise<void> => {
    if (!createdUser?.mot_de_passe_temporaire) return;
    try {
      await navigator.clipboard.writeText(createdUser.mot_de_passe_temporaire);
      toast("Mot de passe copié");
    } catch {
      toast("Impossible de copier le mot de passe", "error");
    }
  };

  if (createdUser?.mot_de_passe_temporaire) {
    return (
      <FormModal
        open={open}
        title="Mot de passe temporaire"
        onClose={handleClose}
        onSubmit={handleClose}
        submitLabel="J'ai noté le mot de passe"
      >
        <p className="text-sm text-muted-foreground">
          L'utilisateur{" "}
          <strong>
            {createdUser.prenom} {createdUser.nom}
          </strong>{" "}
          a été créé. Ce mot de passe ne sera plus affiché.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <code className="flex-1 break-all font-mono text-sm">
            {showPassword
              ? createdUser.mot_de_passe_temporaire
              : "•".repeat(createdUser.mot_de_passe_temporaire.length)}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Masquer" : "Afficher"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyPassword()}>
            <Copy className="mr-1 h-4 w-4" />
            Copier
          </Button>
        </div>
      </FormModal>
    );
  }

  return (
    <FormModal
      open={open}
      title="Créer un utilisateur"
      onClose={handleClose}
      onSubmit={() => createMutation.mutate()}
      loading={createMutation.isPending}
      submitLabel="Créer"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="create-nom">Nom</Label>
          <Input
            id="create-nom"
            value={form.nom}
            onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-prenom">Prénom</Label>
          <Input
            id="create-prenom"
            value={form.prenom}
            onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="create-email">Email</Label>
        <Input
          id="create-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="create-role">Rôle</Label>
        <Select
          id="create-role"
          value={form.role}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              role: e.target.value as UtilisateurCreatePayload["role"],
            }))
          }
        >
          {ROLES_CREATABLE.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="create-password">Mot de passe temporaire (optionnel)</Label>
        <Input
          id="create-password"
          type="password"
          value={form.mot_de_passe ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, mot_de_passe: e.target.value }))}
          placeholder="Laisser vide pour génération automatique"
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">
          Si vide, un mot de passe sera généré et affiché une seule fois.
        </p>
      </div>
    </FormModal>
  );
}
