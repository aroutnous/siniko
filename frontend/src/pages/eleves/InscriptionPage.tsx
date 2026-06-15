import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useElevesAccess } from "@/hooks/useElevesAccess";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { ROUTES } from "@/lib/constants";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, EleveInscrireResponse, Salle } from "@/types";

interface InscriptionForm {
  nom: string;
  prenom: string;
  date_naissance: string;
  lieu_naissance: string;
  sexe: "" | "M" | "F";
  nom_parent: string;
  telephone_parent: string;
  adresse: string;
  classe_id: string;
}

const INITIAL: InscriptionForm = {
  nom: "",
  prenom: "",
  date_naissance: "",
  lieu_naissance: "",
  sexe: "",
  nom_parent: "",
  telephone_parent: "",
  adresse: "",
  classe_id: "",
};

export function InscriptionPage(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canManage } = useElevesAccess();
  const [form, setForm] = useState<InscriptionForm>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<EleveInscrireResponse | null>(null);

  const { data: salles = [], isLoading: loadingClasses } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const { data: anneeActive, isLoading: loadingAnnee } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!anneeActive) throw new Error("Aucune année scolaire active");
      const payload: Record<string, string | undefined> = {
        nom: form.nom,
        prenom: form.prenom,
        classe_id: form.classe_id,
        annee_scolaire_id: anneeActive.id,
        date_naissance: form.date_naissance || undefined,
        lieu_naissance: form.lieu_naissance || undefined,
        sexe: form.sexe || undefined,
        nom_parent: form.nom_parent || undefined,
        telephone_parent: form.telephone_parent || undefined,
        adresse: form.adresse || undefined,
      };
      const { data } = await api.post<EleveInscrireResponse>(
        ELEVES_API.inscrire,
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["eleves"] });
      setCreated(data);
      setForm(INITIAL);
      toast(`Élève inscrit — matricule ${data.eleve.matricule}`);
    },
    onError: (err) => {
      const msg = getErrorMessage(err);
      setError(msg);
      toast(msg, "error");
    },
  });

  const update = (field: keyof InscriptionForm, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!canManage) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  if (loadingClasses || loadingAnnee) {
    return <LoadingSpinner />;
  }

  if (created) {
    return (
      <div className="max-w-lg space-y-6">
        <PageHeader title="Inscription réussie" breadcrumb="Élèves" />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-600" />
            <div>
              <p className="text-lg font-semibold">
                {created.eleve.nom} {created.eleve.prenom}
              </p>
              <p className="text-sm text-muted-foreground">
                Matricule généré :{" "}
                <strong className="text-foreground">{created.eleve.matricule}</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <Link to={`/eleves/${created.eleve.id}/dossier`}>
                <Button>Voir dossier</Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setCreated(null);
                  setError(null);
                }}
              >
                Nouvelle inscription
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Inscrire un élève"
        description="Création du dossier et affectation à une classe"
        breadcrumb="Élèves"
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations élève</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mutation.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input
                id="nom"
                value={form.nom}
                onChange={(e) => update("nom", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom *</Label>
              <Input
                id="prenom"
                value={form.prenom}
                onChange={(e) => update("prenom", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_naissance">Date de naissance</Label>
              <Input
                id="date_naissance"
                type="date"
                value={form.date_naissance}
                onChange={(e) => update("date_naissance", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sexe">Sexe</Label>
              <Select
                id="sexe"
                value={form.sexe}
                onChange={(e) => update("sexe", e.target.value)}
              >
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lieu_naissance">Lieu de naissance</Label>
              <Input
                id="lieu_naissance"
                value={form.lieu_naissance}
                onChange={(e) => update("lieu_naissance", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nom_parent">Nom du parent</Label>
              <Input
                id="nom_parent"
                value={form.nom_parent}
                onChange={(e) => update("nom_parent", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone_parent">Téléphone parent</Label>
              <Input
                id="telephone_parent"
                value={form.telephone_parent}
                onChange={(e) => update("telephone_parent", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input
                id="adresse"
                value={form.adresse}
                onChange={(e) => update("adresse", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="classe_id">Classe *</Label>
              <Select
                id="classe_id"
                value={form.classe_id}
                onChange={(e) => update("classe_id", e.target.value)}
                required
              >
                <option value="">Sélectionner une classe</option>
                {sortedSalles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
                  </option>
                ))}
              </Select>
            </div>
            {anneeActive ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Année scolaire active : <strong>{anneeActive.libelle}</strong>
              </p>
            ) : (
              <p className="text-sm text-destructive sm:col-span-2">
                Aucune année scolaire active configurée.
              </p>
            )}
            {error ? (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending || !anneeActive}>
                {mutation.isPending ? "Inscription…" : "Inscrire l'élève"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(ROUTES.eleves)}>
                Annuler
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
