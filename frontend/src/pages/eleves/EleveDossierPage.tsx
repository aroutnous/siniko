import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeftRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { DocumentsPanel } from "@/components/eleves/DocumentsPanel";
import { EleveCard } from "@/components/eleves/EleveCard";
import {
  EleveFormModal,
  eleveToForm,
  formToPayload,
  type EleveFormValues,
} from "@/components/eleves/EleveFormModal";
import { EleveNotesBulletinsTab } from "@/components/eleves/EleveNotesBulletinsTab";
import { ElevePaiementsTab } from "@/components/eleves/ElevePaiementsTab";
import { TransfertModal } from "@/components/eleves/TransfertModal";
import { FormModal } from "@/components/etablissement/FormModal";
import { EleveStatutBadge } from "@/components/eleves/EleveStatutBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useElevesAccess } from "@/hooks/useElevesAccess";
import { api, getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import {
  buildNiveauxMap,
  getActiveInscription,
  getDossierSalleNom,
  getEleveClasseId,
  inscriptionSalleLabel,
  resolveSalleNom,
} from "@/lib/eleve-utils";
import { useToastStore } from "@/stores/toastStore";
import type {
  Absence,
  AnneeScolaire,
  Classe,
  ClasseNiveau,
  DossierEleve,
  Eleve,
  Inscription,
} from "@/types";

const STATUT_INSCRIPTION: Record<Inscription["statut"], string> = {
  inscrit: "Inscrit",
  transfere: "Transféré",
  abandonne: "Abandonné",
};

export function EleveDossierPage(): React.JSX.Element {
  const { eleveId } = useParams<{ eleveId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canManage, canManageAbsences, canDelete, canPrint } = useElevesAccess();

  const [transferOpen, setTransferOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [justifyOpen, setJustifyOpen] = useState(false);
  const [justifyMotif, setJustifyMotif] = useState("");
  const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null);
  const [form, setForm] = useState<EleveFormValues | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["eleve-dossier", eleveId],
    queryFn: async () => {
      const { data: dossier } = await api.get<DossierEleve>(
        ELEVES_API.dossier(eleveId!),
      );
      return dossier;
    },
    enabled: Boolean(eleveId),
  });

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Classe[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { data: niveaux = [] } = useQuery({
    queryKey: ["classes-niveau"],
    queryFn: async () => {
      const { data } = await api.get<ClasseNiveau[]>(ETABLISSEMENT_API.classesNiveau);
      return data;
    },
  });

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: EleveFormValues) => {
      const { data: eleve } = await api.put<Eleve>(
        ELEVES_API.detail(eleveId!),
        formToPayload(payload),
      );
      return eleve;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["eleve-dossier", eleveId] });
      void queryClient.invalidateQueries({ queryKey: ["eleves"] });
      toast("Informations mises à jour");
      setEditOpen(false);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Eleve>(ELEVES_API.archiver(eleveId!));
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["eleve-dossier", eleveId] });
      void queryClient.invalidateQueries({ queryKey: ["eleves"] });
      toast("Élève archivé");
      setArchiveOpen(false);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(ELEVES_API.detail(eleveId!));
    },
    onSuccess: () => {
      toast("Élève supprimé");
      navigate(ROUTES.eleves);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const justifyMutation = useMutation({
    mutationFn: async ({ id, motif }: { id: string; motif: string }) => {
      const { data: absence } = await api.put<Absence>(
        ELEVES_API.justifierAbsence(id),
        { motif },
      );
      return absence;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["eleve-dossier", eleveId] });
      toast("Absence justifiée");
      setJustifyOpen(false);
      setJustifyMotif("");
      setSelectedAbsence(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  if (isLoading || !data || !eleveId) {
    return <LoadingSpinner />;
  }

  const activeInscription = getActiveInscription(data.inscriptions);
  const classeId = getEleveClasseId(data);
  const niveauxMap = buildNiveauxMap(niveaux);
  const fromApiSalle = getDossierSalleNom(data);
  const salleNom =
    fromApiSalle !== "—"
      ? fromApiSalle
      : resolveSalleNom(classeId, salles, niveauxMap);
  const eleveNom = `${data.eleve.nom} ${data.eleve.prenom}`;

  const anneeMap = new Map(annees.map((a) => [a.id, a.libelle]));

  const historiqueColumns: DataTableColumn<Inscription>[] = [
    {
      key: "annee",
      header: "Année",
      render: (r) => anneeMap.get(r.annee_scolaire_id) ?? r.annee_scolaire_id,
    },
    {
      key: "classe",
      header: "Salle",
      render: (r) => inscriptionSalleLabel(r, salles, niveauxMap),
    },
    { key: "date", header: "Date inscription", render: (r) => r.date_inscription },
    {
      key: "statut",
      header: "Statut",
      render: (r) => (
        <Badge variant={r.statut === "inscrit" ? "success" : "muted"}>
          {STATUT_INSCRIPTION[r.statut]}
        </Badge>
      ),
    },
  ];

  const absenceColumns: DataTableColumn<Absence>[] = [
    { key: "date", header: "Date", render: (r) => r.date_absence },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={r.type === "absence" ? "warning" : "default"}>
          {r.type === "absence" ? "Absence" : "Retard"}
        </Badge>
      ),
    },
    {
      key: "justifiee",
      header: "Justifiée",
      render: (r) => (
        <Badge variant={r.justifiee ? "success" : "destructive"}>
          {r.justifiee ? "Oui" : "Non"}
        </Badge>
      ),
    },
    { key: "motif", header: "Motif", render: (r) => r.motif ?? "—" },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        !r.justifiee && canManageAbsences ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedAbsence(r);
              setJustifyOpen(true);
            }}
          >
            Justifier
          </Button>
        ) : null,
    },
  ];

  const openEdit = (): void => {
    setForm(eleveToForm(data.eleve));
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dossier élève"
        description="Informations, historique et documents"
        breadcrumb="Élèves"
        action={
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Transférer
              </Button>
            ) : null}
            {canManage ? (
              <>
                <Button variant="outline" onClick={openEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifier
                </Button>
                {data.eleve.statut === "actif" ? (
                  <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archiver
                  </Button>
                ) : null}
              </>
            ) : null}
            {canDelete ? (
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </Button>
            ) : null}
            <Link to={ROUTES.eleves}>
              <Button variant="outline">Retour à la liste</Button>
            </Link>
          </div>
        }
      />

      <EleveCard eleve={data.eleve} classeNom={salleNom} />

      <Tabs defaultValue="informations">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="informations">Informations</TabsTrigger>
          <TabsTrigger value="historique">Historique scolaire</TabsTrigger>
          <TabsTrigger value="absences">
            Absences ({data.absences.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes &amp; Bulletins</TabsTrigger>
          <TabsTrigger value="paiements">Paiements</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="informations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Données personnelles</CardTitle>
              <EleveStatutBadge statut={data.eleve.statut} />
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-medium">Matricule :</span> {data.eleve.matricule}
              </p>
              <p>
                <span className="font-medium">Nom complet :</span>{" "}
                {data.eleve.nom} {data.eleve.prenom}
              </p>
              <p>
                <span className="font-medium">Date de naissance :</span>{" "}
                {data.eleve.date_naissance ?? "—"}
              </p>
              <p>
                <span className="font-medium">Lieu de naissance :</span>{" "}
                {data.eleve.lieu_naissance ?? "—"}
              </p>
              <p>
                <span className="font-medium">Sexe :</span>{" "}
                {data.eleve.sexe === "M"
                  ? "Masculin"
                  : data.eleve.sexe === "F"
                    ? "Féminin"
                    : "—"}
              </p>
              <p>
                <span className="font-medium">Photo :</span>{" "}
                {data.eleve.photo_url ? (
                  <a
                    href={data.eleve.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Voir
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <p>
                <span className="font-medium">Parent / tuteur :</span>{" "}
                {data.eleve.nom_parent ?? "—"}
              </p>
              <p>
                <span className="font-medium">Téléphone parent :</span>{" "}
                {data.eleve.telephone_parent ?? "—"}
              </p>
              <p className="sm:col-span-2">
                <span className="font-medium">Adresse :</span>{" "}
                {data.eleve.adresse ?? "—"}
              </p>
              {activeInscription ? (
                <p className="sm:col-span-2 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="font-medium">Inscription active :</span>{" "}
                  {activeInscription.date_inscription} — {salleNom}
                  {anneeMap.get(activeInscription.annee_scolaire_id)
                    ? ` (${anneeMap.get(activeInscription.annee_scolaire_id)})`
                    : ""}
                </p>
              ) : (
                <p className="sm:col-span-2 text-muted-foreground">
                  Aucune inscription active.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historique">
          <DataTable
            columns={historiqueColumns}
            data={data.inscriptions}
            page={1}
            pageSize={data.inscriptions.length || 1}
            total={data.inscriptions.length}
            onPageChange={() => undefined}
            emptyMessage="Aucune inscription"
          />
        </TabsContent>

        <TabsContent value="absences">
          <DataTable
            columns={absenceColumns}
            data={data.absences}
            page={1}
            pageSize={data.absences.length || 1}
            total={data.absences.length}
            onPageChange={() => undefined}
            emptyMessage="Aucune absence enregistrée"
          />
        </TabsContent>

        <TabsContent value="notes">
          <EleveNotesBulletinsTab eleveId={eleveId} eleveNom={eleveNom} />
        </TabsContent>

        <TabsContent value="paiements">
          <ElevePaiementsTab eleveId={eleveId} anneeId={anneeActive?.id} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel
            eleveId={eleveId}
            matricule={data.eleve.matricule}
            disabled={!canPrint}
          />
        </TabsContent>
      </Tabs>

      {form ? (
        <EleveFormModal
          open={editOpen}
          title="Modifier les informations personnelles"
          form={form}
          loading={saveMutation.isPending}
          onClose={() => setEditOpen(false)}
          onSubmit={() => saveMutation.mutate(form)}
          onChange={setForm}
        />
      ) : null}

      {canManage ? (
        <TransfertModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          eleveId={eleveId}
          currentClasseId={classeId}
        />
      ) : null}

      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)}>
        <h2 className="mb-2 text-lg font-semibold">Archiver cet élève ?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Il ne sera plus actif.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setArchiveOpen(false)}>
            Annuler
          </Button>
          <Button
            disabled={archiveMutation.isPending}
            onClick={() => archiveMutation.mutate()}
          >
            Archiver
          </Button>
        </div>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <h2 className="mb-2 text-lg font-semibold">Supprimer cet élève ?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Action irréversible.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>

      <FormModal
        open={justifyOpen}
        title="Justifier l'absence"
        onClose={() => {
          setJustifyOpen(false);
          setJustifyMotif("");
          setSelectedAbsence(null);
        }}
        onSubmit={() => {
          if (!selectedAbsence || !justifyMotif.trim()) {
            toast("Le motif est obligatoire", "error");
            return;
          }
          justifyMutation.mutate({ id: selectedAbsence.id, motif: justifyMotif });
        }}
        loading={justifyMutation.isPending}
        submitLabel="Justifier"
      >
        <div className="space-y-2">
          <Label htmlFor="motif_justification">Motif *</Label>
          <Input
            id="motif_justification"
            value={justifyMotif}
            onChange={(e) => setJustifyMotif(e.target.value)}
            required
          />
        </div>
      </FormModal>
    </div>
  );
}
