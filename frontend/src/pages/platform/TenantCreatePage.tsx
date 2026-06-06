import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import type { PlanAbonnement, TenantCreatePayload, TenantCreateResponse } from "@/types";

interface FormState {
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  plan_id: string;
  promoteur_email: string;
  promoteur_nom: string;
  promoteur_prenom: string;
}

const INITIAL: FormState = {
  nom: "",
  email: "",
  telephone: "",
  adresse: "",
  plan_id: "",
  promoteur_email: "",
  promoteur_nom: "",
  promoteur_prenom: "",
};

export function TenantCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TenantCreateResponse | null>(null);

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () => {
      const { data } = await api.get<PlanAbonnement[]>("/platform/plans");
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: TenantCreatePayload) => {
      const { data } = await api.post<TenantCreateResponse>("/platform/tenants", payload);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const payload: TenantCreatePayload = {
      nom: form.nom.trim(),
      email: form.email.trim(),
      plan_id: form.plan_id,
      promoteur_email: form.promoteur_email.trim(),
      promoteur_nom: form.promoteur_nom.trim(),
      promoteur_prenom: form.promoteur_prenom.trim(),
    };
    if (form.telephone.trim()) payload.telephone = form.telephone.trim();
    if (form.adresse.trim()) payload.adresse = form.adresse.trim();
    mutation.mutate(payload);
  };

  if (loadingPlans) return <LoadingSpinner />;

  if (result) {
    return (
      <div>
        <PageHeader title="Tenant créé" breadcrumb="Platform Owner / Tenants" />
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>{result.tenant.nom}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Slug :</span> {result.tenant.slug}
            </p>
            <p>
              <span className="font-medium">Promoteur :</span> {result.promoteur_email}
            </p>
            <p>
              <span className="font-medium">Mot de passe temporaire :</span>{" "}
              <code className="rounded bg-muted px-2 py-1">{result.mot_de_passe_temporaire}</code>
            </p>
            <Button className="mt-4" onClick={() => navigate(ROUTES.platformTenants)}>
              Retour à la liste
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Créer un tenant"
        description="Nouvel établissement et compte promoteur"
        breadcrumb="Platform Owner / Tenants"
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations établissement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nom">Nom de l'établissement *</Label>
              <Input
                id="nom"
                value={form.nom}
                onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email contact *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                value={form.telephone}
                onChange={(e) => setForm((p) => ({ ...p, telephone: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input
                id="adresse"
                value={form.adresse}
                onChange={(e) => setForm((p) => ({ ...p, adresse: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan_id">Plan d'abonnement *</Label>
              <Select
                id="plan_id"
                value={form.plan_id}
                onChange={(e) => setForm((p) => ({ ...p, plan_id: e.target.value }))}
                required
              >
                <option value="">Sélectionner un plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.nom} — {plan.prix_mensuel} FCFA/mois
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Compte promoteur</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="promoteur_prenom">Prénom *</Label>
              <Input
                id="promoteur_prenom"
                value={form.promoteur_prenom}
                onChange={(e) => setForm((p) => ({ ...p, promoteur_prenom: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promoteur_nom">Nom *</Label>
              <Input
                id="promoteur_nom"
                value={form.promoteur_nom}
                onChange={(e) => setForm((p) => ({ ...p, promoteur_nom: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="promoteur_email">Email promoteur *</Label>
              <Input
                id="promoteur_email"
                type="email"
                value={form.promoteur_email}
                onChange={(e) => setForm((p) => ({ ...p, promoteur_email: e.target.value }))}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Création…" : "Créer le tenant"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(ROUTES.platformTenants)}
              >
                Annuler
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
