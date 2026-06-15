import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  EleveFormModal,
  eleveToForm,
  formToPayload,
  type EleveFormValues,
} from "@/components/eleves/EleveFormModal";
import { EleveStatutBadge } from "@/components/eleves/EleveStatutBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useElevesAccess } from "@/hooks/useElevesAccess";
import { api, getErrorMessage } from "@/lib/api";
import { buildNiveauxMap, formatSalleNom, resolveSalleNom } from "@/lib/eleve-utils";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import { ROUTES } from "@/lib/constants";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, Classe, ClasseNiveau, Eleve, EleveListItem } from "@/types";

const PAGE_SIZE = 10;

const EMPTY_FORM: EleveFormValues = {
  nom: "",
  prenom: "",
  date_naissance: "",
  lieu_naissance: "",
  sexe: "",
  photo_url: "",
  nom_parent: "",
  telephone_parent: "",
  adresse: "",
};

export function ElevesListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canRead, canManage, canDelete } = useElevesAccess();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [classeId, setClasseId] = useState("");
  const [anneeId, setAnneeId] = useState("");
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<EleveListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EleveListItem | null>(null);
  const [form, setForm] = useState<EleveFormValues>(EMPTY_FORM);

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

  const niveauxMap = useMemo(() => buildNiveauxMap(niveaux), [niveaux]);

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

  const { data: eleves = [], isLoading } = useQuery({
    queryKey: ["eleves", search, classeId, anneeId],
    enabled: canRead,
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search.trim()) params.query = search.trim();
      if (classeId) params.classe_id = classeId;
      if (anneeId) params.annee_id = anneeId;
      const { data } = await api.get<EleveListItem[]>(ELEVES_API.list, { params });
      return data;
    },
  });

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return eleves.slice(start, start + PAGE_SIZE);
  }, [eleves, page]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: EleveFormValues }) => {
      const { data } = await api.put<Eleve>(ELEVES_API.detail(id), formToPayload(payload));
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["eleves"] });
      toast("Élève modifié");
      setEditTarget(null);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(ELEVES_API.detail(id));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["eleves"] });
      toast("Élève supprimé");
      setDeleteTarget(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<EleveListItem>[] = [
    { key: "matricule", header: "Matricule", render: (r) => r.matricule },
    { key: "nom", header: "Nom", render: (r) => r.nom },
    { key: "prenom", header: "Prénom", render: (r) => r.prenom },
    {
      key: "classe",
      header: "Classe",
      render: (r) =>
        r.salle_nom ??
        (r.salle_id ? resolveSalleNom(r.salle_id, salles, niveauxMap) : null) ??
        r.classe_nom ??
        "—",
    },
    {
      key: "statut",
      header: "Statut",
      render: (r) => <EleveStatutBadge statut={r.statut} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/eleves/${r.id}/dossier`)}
          >
            Voir dossier
          </Button>
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditTarget(r);
                setForm(eleveToForm(r));
              }}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Modifier
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(r)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Supprimer
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const handleSearch = (): void => {
    setSearch(query);
    setPage(1);
  };

  const handleFilterChange = (field: "classe" | "annee", value: string): void => {
    if (field === "classe") setClasseId(value);
    else setAnneeId(value);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Élèves"
        description="Recherche et gestion des élèves inscrits"
        breadcrumb="Gestion"
        action={
          canManage ? (
            <Link to={ROUTES.elevesInscrire}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Inscrire un élève
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Rechercher par nom, prénom ou matricule…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-md"
        />
        <Button variant="outline" onClick={handleSearch}>
          <Search className="mr-2 h-4 w-4" />
          Rechercher
        </Button>
        <Select
          value={classeId}
          onChange={(e) => handleFilterChange("classe", e.target.value)}
          className="max-w-[220px]"
        >
          <option value="">Toutes les classes</option>
          {salles.map((s) => (
            <option key={s.id} value={s.id}>
              {formatSalleNom(s, niveauxMap)}
            </option>
          ))}
        </Select>
        <Select
          value={anneeId}
          onChange={(e) => handleFilterChange("annee", e.target.value)}
          className="max-w-[180px]"
        >
          <option value="">Toutes les années</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={paginated}
          page={page}
          pageSize={PAGE_SIZE}
          total={eleves.length}
          onPageChange={setPage}
        />
      )}

      <EleveFormModal
        open={Boolean(editTarget)}
        title="Modifier l'élève"
        form={form}
        loading={saveMutation.isPending}
        onClose={() => {
          setEditTarget(null);
          setForm(EMPTY_FORM);
        }}
        onSubmit={() => editTarget && saveMutation.mutate({ id: editTarget.id, payload: form })}
        onChange={setForm}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <h2 className="mb-2 text-lg font-semibold">Supprimer cet élève ?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Toutes ses données associées seront perdues. Cette action est irréversible.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
