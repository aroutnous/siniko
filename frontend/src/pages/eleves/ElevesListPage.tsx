import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EleveStatutBadge } from "@/components/eleves/EleveStatutBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useElevesAccess } from "@/hooks/useElevesAccess";
import { api } from "@/lib/api";
import { getEleveClasseId, resolveClasseNom } from "@/lib/eleve-utils";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import { ROUTES } from "@/lib/constants";
import type { AnneeScolaire, Classe, DossierEleve, EleveListItem } from "@/types";

const PAGE_SIZE = 10;

export function ElevesListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { canRead, canManage } = useElevesAccess();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [classeId, setClasseId] = useState("");
  const [anneeId, setAnneeId] = useState("");
  const [page, setPage] = useState(1);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data } = await api.get<Classe[]>(ETABLISSEMENT_API.classes);
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

  const dossierQueries = useQueries({
    queries: paginated.map((eleve) => ({
      queryKey: ["eleve-dossier-mini", eleve.id],
      queryFn: async () => {
        const { data } = await api.get<DossierEleve>(ELEVES_API.dossier(eleve.id));
        return data;
      },
      staleTime: 60_000,
      enabled: !classeId,
    })),
  });

  const enrichedEleves = useMemo((): EleveListItem[] => {
    if (classeId) {
      const classeNom = resolveClasseNom(classeId, classes);
      return paginated.map((e) => ({ ...e, classe_nom: classeNom }));
    }
    return paginated.map((eleve, index) => {
      const dossier = dossierQueries[index]?.data;
      const cid = dossier ? getEleveClasseId(dossier) : undefined;
      return { ...eleve, classe_nom: resolveClasseNom(cid, classes) };
    });
  }, [paginated, classeId, classes, dossierQueries]);

  const columns: DataTableColumn<EleveListItem>[] = [
    { key: "matricule", header: "Matricule", render: (r) => r.matricule },
    { key: "nom", header: "Nom", render: (r) => r.nom },
    { key: "prenom", header: "Prénom", render: (r) => r.prenom },
    {
      key: "classe",
      header: "Classe",
      render: (r) => r.classe_nom ?? "—",
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/eleves/${r.id}/dossier`)}
        >
          Voir dossier
        </Button>
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

  const loadingDossiers = !classeId && dossierQueries.some((q) => q.isLoading);

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
          className="max-w-[180px]"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
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

      {isLoading || loadingDossiers ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={enrichedEleves}
          page={page}
          pageSize={PAGE_SIZE}
          total={eleves.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
