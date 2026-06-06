import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import type { Eleve } from "@/types";

const PAGE_SIZE = 10;

export function ElevesListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: eleves = [], isLoading } = useQuery({
    queryKey: ["eleves", search],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search.trim()) params.query = search.trim();
      const { data } = await api.get<Eleve[]>("/eleves/", { params });
      return data;
    },
  });

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return eleves.slice(start, start + PAGE_SIZE);
  }, [eleves, page]);

  const columns: DataTableColumn<Eleve>[] = [
    { key: "matricule", header: "Matricule", render: (r) => r.matricule },
    {
      key: "nom",
      header: "Nom complet",
      render: (r) => `${r.nom} ${r.prenom}`,
    },
    { key: "statut", header: "Statut", render: (r) => r.statut },
    {
      key: "parent",
      header: "Parent",
      render: (r) => r.nom_parent ?? "—",
    },
    {
      key: "dossier",
      header: "Dossier",
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/eleves/${r.id}/dossier`)}
        >
          Voir
        </Button>
      ),
    },
  ];

  const handleSearch = (): void => {
    setSearch(query);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Élèves"
        description="Liste des élèves inscrits"
        breadcrumb="Gestion"
        action={
          <Link to={ROUTES.elevesInscrire}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Inscrire un élève
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
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
    </div>
  );
}
