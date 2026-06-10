import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getErrorMessage } from "@/lib/api";
import { PLATFORM_API } from "@/lib/platform-api";
import { useToastStore } from "@/stores/toastStore";
import type { PlanAbonnement, PlanUpdatePayload } from "@/types";

interface PlanForm {
  nom: string;
  prix_mensuel: string;
  max_eleves: string;
  max_utilisateurs: string;
}

interface PlanEditModalProps {
  open: boolean;
  plan: PlanAbonnement | null;
  onClose: () => void;
  onSaved: () => void;
}

function toForm(plan: PlanAbonnement): PlanForm {
  return {
    nom: plan.nom,
    prix_mensuel: String(plan.prix_mensuel),
    max_eleves: plan.max_eleves != null ? String(plan.max_eleves) : "",
    max_utilisateurs: plan.max_utilisateurs != null ? String(plan.max_utilisateurs) : "",
  };
}

export function PlanEditModal({
  open,
  plan,
  onClose,
  onSaved,
}: PlanEditModalProps): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [form, setForm] = useState<PlanForm>({
    nom: "",
    prix_mensuel: "",
    max_eleves: "",
    max_utilisateurs: "",
  });

  useEffect(() => {
    if (plan) setForm(toForm(plan));
  }, [plan]);

  const mutation = useMutation({
    mutationFn: async (payload: PlanUpdatePayload) => {
      if (!plan) throw new Error("Plan manquant");
      const { data } = await api.put<PlanAbonnement>(PLATFORM_API.plan(plan.id), payload);
      return data;
    },
    onSuccess: () => {
      toast("Plan modifié");
      onSaved();
      onClose();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const save = (): void => {
    if (!plan) return;
    const payload: PlanUpdatePayload = {
      nom: form.nom.trim(),
      prix_mensuel: form.prix_mensuel,
      fonctionnalites: plan.fonctionnalites,
    };
    if (form.max_eleves) payload.max_eleves = Number(form.max_eleves);
    if (form.max_utilisateurs) payload.max_utilisateurs = Number(form.max_utilisateurs);
    mutation.mutate(payload);
  };

  return (
    <FormModal
      open={open && plan !== null}
      title="Modifier le plan"
      onClose={onClose}
      onSubmit={() => save()}
      loading={mutation.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-plan-nom">Nom *</Label>
          <Input
            id="edit-plan-nom"
            value={form.nom}
            onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-plan-prix">Prix mensuel (FCFA) *</Label>
          <Input
            id="edit-plan-prix"
            type="number"
            min="1"
            value={form.prix_mensuel}
            onChange={(e) => setForm((p) => ({ ...p, prix_mensuel: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-plan-eleves">Max élèves</Label>
          <Input
            id="edit-plan-eleves"
            type="number"
            min="1"
            value={form.max_eleves}
            onChange={(e) => setForm((p) => ({ ...p, max_eleves: e.target.value }))}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-plan-users">Max utilisateurs</Label>
          <Input
            id="edit-plan-users"
            type="number"
            min="1"
            value={form.max_utilisateurs}
            onChange={(e) => setForm((p) => ({ ...p, max_utilisateurs: e.target.value }))}
          />
        </div>
      </div>
    </FormModal>
  );
}
