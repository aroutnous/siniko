import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ELEVES_API } from "@/lib/eleves-api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import { formatStatutCompetence } from "@/lib/pedagogie-utils";
import type { Eleve, Matiere, Note, Periode } from "@/types";

interface HistoriqueRow extends Note {
  matiere_nom: string;
  periode_nom: string;
}

export function HistoriqueNotesPage(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEleveId, setSelectedEleveId] = useState("");

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ["eleves-search", search],
    queryFn: async () => {
      const params: Record<string, string> = { query: search };
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, { params });
      return data;
    },
    enabled: search.trim().length >= 2,
  });

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { data: matieres = [] } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["historique-notes", selectedEleveId],
    queryFn: async () => {
      const { data } = await api.get<Note[]>(
        PEDAGOGIE_API.notesHistorique(selectedEleveId),
      );
      return data;
    },
    enabled: Boolean(selectedEleveId),
  });

  const periodeMap = useMemo(
    () => new Map(periodes.map((p) => [p.id, p.nom])),
    [periodes],
  );
  const matiereMap = useMemo(
    () => new Map(matieres.map((m) => [m.id, m.nom])),
    [matieres],
  );

  const rows: HistoriqueRow[] = notes.map((n) => ({
    ...n,
    matiere_nom:
      (n.matiere_id ? matiereMap.get(n.matiere_id) : undefined) ??
      n.matiere_id ??
      "—",
    periode_nom:
      (n.periode_id ? periodeMap.get(n.periode_id) : undefined) ??
      n.periode_id ??
      "—",
  }));

  const groupedByPeriode = useMemo(() => {
    const groups = new Map<string, HistoriqueRow[]>();
    for (const row of rows) {
      const key = row.periode_nom;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const columns: DataTableColumn<HistoriqueRow>[] = [
    { key: "matiere", header: "Matière", render: (r) => r.matiere_nom },
    {
      key: "note",
      header: "Note / Statut",
      render: (r) =>
        r.valeur_qualitative
          ? formatStatutCompetence(r.valeur_qualitative)
          : r.valeur != null
            ? Number(r.valeur).toFixed(2)
            : "—",
    },
    {
      key: "moyenne_classe",
      header: "Moy. classe",
      render: () => "—",
    },
    { key: "appreciation", header: "Appréciation", render: (r) => r.appreciation ?? "—" },
    { key: "periode", header: "Période", render: (r) => r.periode_nom },
  ];

  const selectedEleve = searchResults.find((e) => e.id === selectedEleveId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historique des notes"
        description="Consultation des notes par élève"
        breadcrumb="Pédagogie"
      />

      <div className="flex gap-2">
        <Input
          placeholder="Rechercher par nom ou matricule…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(query)}
          className="max-w-md"
        />
        <Button variant="outline" onClick={() => setSearch(query)}>
          <Search className="mr-2 h-4 w-4" />
          Rechercher
        </Button>
      </div>

      {searching ? <LoadingSpinner /> : null}

      {search.trim().length >= 2 && searchResults.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {searchResults.map((eleve) => (
            <Button
              key={eleve.id}
              variant={selectedEleveId === eleve.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedEleveId(eleve.id)}
            >
              {eleve.matricule} — {eleve.nom} {eleve.prenom}
            </Button>
          ))}
        </div>
      ) : null}

      {search.trim().length >= 2 && !searching && searchResults.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun élève trouvé.</p>
      ) : null}

      {selectedEleveId && loadingNotes ? <LoadingSpinner /> : null}

      {selectedEleve && !loadingNotes ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="font-semibold">
                {selectedEleve.nom} {selectedEleve.prenom}
              </p>
              <p className="text-sm text-muted-foreground">
                Matricule {selectedEleve.matricule} · {notes.length} note(s)
              </p>
            </CardContent>
          </Card>

          {groupedByPeriode.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune note enregistrée.</p>
          ) : (
            groupedByPeriode.map(([periodeNom, periodeNotes]) => (
              <div key={periodeNom} className="space-y-2">
                <h3 className="font-medium">{periodeNom}</h3>
                <DataTable
                  columns={columns}
                  data={periodeNotes}
                  page={1}
                  pageSize={periodeNotes.length || 1}
                  total={periodeNotes.length}
                  onPageChange={() => {}}
                />
              </div>
            ))
          )}
        </div>
      ) : null}

      {!selectedEleveId ? (
        <p className="text-sm text-muted-foreground">
          Recherchez et sélectionnez un élève pour afficher son historique.
        </p>
      ) : null}
    </div>
  );
}
