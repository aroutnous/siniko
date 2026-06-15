import { useQuery } from "@tanstack/react-query";
import { Download, FileText, IdCard, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ExportButton } from "@/components/reporting/ExportButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API } from "@/lib/finance-api";
import { getEleveClasseId } from "@/lib/eleve-utils";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import { REPORTING_API } from "@/lib/reporting-api";
import { useToastStore } from "@/stores/toastStore";
import type {
  Bulletin,
  DossierEleve,
  Eleve,
  Paiement,
  Periode,
  Salle,
} from "@/types";

export function HubDocumentairePage(): React.JSX.Element {
  const hasPermission = useHasPermission();

  const showBulletins = hasPermission("documents.bulletins");
  const showAdmin =
    hasPermission("documents.cartes_scolaires") ||
    hasPermission("documents.attestations") ||
    hasPermission("documents.certificats");
  const showRecus = hasPermission("documents.recus");
  const showListes = hasPermission("documents.listes_classe");
  const showRapports = hasPermission("documents.rapports");

  const hasAny =
    showBulletins || showAdmin || showRecus || showListes || showRapports;

  if (!hasAny) {
    return (
      <p className="text-sm text-muted-foreground">
        Vous n&apos;avez pas accès au hub documentaire.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Hub Documentaire"
        description="Impression et téléchargement des documents scolaires"
      />
      {showBulletins ? <BulletinsSection /> : null}
      {showAdmin ? <DocumentsAdminSection hasPermission={hasPermission} /> : null}
      {showRecus ? <RecusSection /> : null}
      {showListes ? <ListesClasseSection /> : null}
      {showRapports ? <RapportsExportSection /> : null}
    </div>
  );
}

function BulletinsSection(): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedEleveId, setSelectedEleveId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["docs-eleves", query],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, {
        params: { query },
      });
      return data;
    },
    enabled: query.trim().length >= 2,
  });

  const { data: dossier } = useQuery({
    queryKey: ["docs-dossier", selectedEleveId],
    queryFn: async () => {
      const { data } = await api.get<DossierEleve>(ELEVES_API.dossier(selectedEleveId));
      return data;
    },
    enabled: Boolean(selectedEleveId),
  });

  const classeId = dossier ? getEleveClasseId(dossier) : "";

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { data: bulletins = [], isLoading } = useQuery({
    queryKey: ["docs-bulletins", classeId, periodeId],
    queryFn: async () => {
      const { data } = await api.post<Bulletin[]>(PEDAGOGIE_API.bulletinsGenerer, {
        classe_id: classeId,
        periode_id: periodeId,
      });
      return data.filter((b) => b.statut === "publie");
    },
    enabled: Boolean(classeId && periodeId),
  });

  const eleveBulletins = useMemo(
    () => bulletins.filter((b) => b.eleve_id === selectedEleveId),
    [bulletins, selectedEleveId],
  );

  const handleDownload = async (bulletin: Bulletin): Promise<void> => {
    setDownloadingId(bulletin.id);
    try {
      await downloadPdf(
        REPORTING_API.impressionBulletin(bulletin.id),
        `bulletin-${bulletin.id}.pdf`,
      );
      toast("Bulletin téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: DataTableColumn<Bulletin>[] = [
    {
      key: "moyenne",
      header: "Moyenne",
      render: (r) => (r.moyenne_generale != null ? String(r.moyenne_generale) : "—"),
    },
    {
      key: "rang",
      header: "Rang",
      render: (r) => (r.rang != null ? `${r.rang}/${r.effectif_classe ?? "?"}` : "—"),
    },
    {
      key: "mention",
      header: "Mention",
      render: (r) => r.mention ?? "—",
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          disabled={downloadingId === r.id}
          onClick={() => void handleDownload(r)}
        >
          <Download className="mr-2 h-4 w-4" />
          PDF
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulletins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Rechercher un élève…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setQuery(search.trim())}
          >
            <Search className="mr-2 h-4 w-4" />
            Rechercher
          </Button>
        </div>
        {query.length >= 2 ? (
          <Select
            value={selectedEleveId}
            onChange={(e) => setSelectedEleveId(e.target.value)}
            className="max-w-md"
          >
            <option value="">Sélectionner un élève</option>
            {results.map((e) => (
              <option key={e.id} value={e.id}>
                {e.matricule} — {e.nom} {e.prenom}
              </option>
            ))}
          </Select>
        ) : null}
        {selectedEleveId ? (
          <Select
            value={periodeId}
            onChange={(e) => setPeriodeId(e.target.value)}
            className="max-w-xs"
          >
            <option value="">Période</option>
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </Select>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : eleveBulletins.length > 0 ? (
          <DataTable
            columns={columns}
            data={eleveBulletins}
            page={1}
            pageSize={eleveBulletins.length}
            total={eleveBulletins.length}
            onPageChange={() => undefined}
          />
        ) : selectedEleveId && periodeId ? (
          <p className="text-sm text-muted-foreground">Aucun bulletin publié.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocumentsAdminSection({
  hasPermission,
}: {
  hasPermission: (p: string) => boolean;
}): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedEleve, setSelectedEleve] = useState<Eleve | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["docs-admin-eleves", query],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, { params: { query } });
      return data;
    },
    enabled: query.trim().length >= 2,
  });

  const downloadDoc = async (
    type: "carte" | "attestation" | "certificat",
  ): Promise<void> => {
    if (!selectedEleve) return;
    const paths = {
      carte: ELEVES_API.carteScolaire(selectedEleve.id),
      attestation: ELEVES_API.attestation(selectedEleve.id),
      certificat: ELEVES_API.certificat(selectedEleve.id),
    };
    const names = {
      carte: `carte-scolaire-${selectedEleve.matricule}.pdf`,
      attestation: `attestation-${selectedEleve.matricule}.pdf`,
      certificat: `certificat-${selectedEleve.matricule}.pdf`,
    };
    setDownloading(type);
    try {
      await downloadPdf(paths[type], names[type]);
      toast("Document téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents administratifs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Rechercher un élève…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button type="button" variant="outline" onClick={() => setQuery(search.trim())}>
            <Search className="mr-2 h-4 w-4" />
            Rechercher
          </Button>
        </div>
        {query.length >= 2 ? (
          <Select
            value={selectedEleve?.id ?? ""}
            onChange={(e) => {
              const found = results.find((r) => r.id === e.target.value) ?? null;
              setSelectedEleve(found);
            }}
            className="max-w-md"
          >
            <option value="">Sélectionner un élève</option>
            {results.map((e) => (
              <option key={e.id} value={e.id}>
                {e.matricule} — {e.nom} {e.prenom}
              </option>
            ))}
          </Select>
        ) : null}
        {selectedEleve ? (
          <div className="flex flex-wrap gap-3">
            {hasPermission("documents.cartes_scolaires") ? (
              <Button
                variant="outline"
                disabled={downloading !== null}
                onClick={() => void downloadDoc("carte")}
              >
                <IdCard className="mr-2 h-4 w-4" />
                {downloading === "carte" ? "…" : "Carte scolaire"}
              </Button>
            ) : null}
            {hasPermission("documents.attestations") ? (
              <Button
                variant="outline"
                disabled={downloading !== null}
                onClick={() => void downloadDoc("attestation")}
              >
                <FileText className="mr-2 h-4 w-4" />
                {downloading === "attestation" ? "…" : "Attestation"}
              </Button>
            ) : null}
            {hasPermission("documents.certificats") ? (
              <Button
                variant="outline"
                disabled={downloading !== null}
                onClick={() => void downloadDoc("certificat")}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading === "certificat" ? "…" : "Certificat"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RecusSection(): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [refSearch, setRefSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data: paiements = [] } = useQuery({
    queryKey: ["docs-paiements"],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.transactions);
      return data;
    },
  });

  const { data: eleves = [] } = useQuery({
    queryKey: ["docs-eleves-all"],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list);
      return data;
    },
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );

  const matches = useMemo(() => {
    const term = refSearch.trim().toLowerCase();
    if (!term) return [];
    return paiements
      .filter(
        (p) =>
          p.reference_transaction?.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          eleveMap.get(p.eleve_id)?.toLowerCase().includes(term),
      )
      .slice(0, 20);
  }, [paiements, refSearch, eleveMap]);

  const handleRecu = async (paiement: Paiement): Promise<void> => {
    setDownloading(true);
    try {
      await downloadPdf(
        REPORTING_API.impressionRecu(paiement.id),
        `recu-${paiement.reference_transaction ?? paiement.id}.pdf`,
      );
      toast("Reçu téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reçus de paiement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Référence ou nom d'élève…"
          value={refSearch}
          onChange={(e) => setRefSearch(e.target.value)}
          className="max-w-md"
        />
        {matches.length > 0 ? (
          <ul className="space-y-2">
            {matches.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  {eleveMap.get(p.eleve_id) ?? p.eleve_id.slice(0, 8)} —{" "}
                  {Number(p.montant_paye).toLocaleString("fr-FR")} FCFA —{" "}
                  {p.reference_transaction ?? p.id.slice(0, 8)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloading}
                  onClick={() => void handleRecu(p)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Imprimer
                </Button>
              </li>
            ))}
          </ul>
        ) : refSearch.trim() ? (
          <p className="text-sm text-muted-foreground">Aucun résultat.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ListesClasseSection(): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [classeId, setClasseId] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const handleDownload = async (): Promise<void> => {
    if (!classeId) return;
    setLoading(true);
    try {
      await downloadPdf(
        REPORTING_API.impressionListeClasse(classeId),
        `liste-classe-${classeId}.pdf`,
      );
      toast("Liste téléchargée");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listes de classe</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="liste-classe">Classe</Label>
          <Select
            id="liste-classe"
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="">Sélectionner</option>
            {sortedSalles.map((s) => (
              <option key={s.id} value={s.id}>
                {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
              </option>
            ))}
          </Select>
        </div>
        <Button disabled={!classeId || loading} onClick={() => void handleDownload()}>
          <Download className="mr-2 h-4 w-4" />
          {loading ? "Téléchargement…" : "Télécharger PDF"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RapportsExportSection(): React.JSX.Element {
  const [anneeId, setAnneeId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [rapportType, setRapportType] = useState<"financier" | "resultats">("financier");

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get(ETABLISSEMENT_API.annees);
      return data as { id: string; libelle: string }[];
    },
  });

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
    enabled: rapportType === "resultats",
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
    enabled: rapportType === "resultats",
  });

  const exportUrl =
    rapportType === "financier"
      ? REPORTING_API.exportRapportFinancier
      : REPORTING_API.exportResultatsClasse;

  const exportParams: Record<string, string> =
    rapportType === "financier"
      ? { annee_id: anneeId }
      : { classe_id: classeId, periode_id: periodeId };

  const canExport =
    rapportType === "financier" ? Boolean(anneeId) : Boolean(classeId && periodeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rapports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={rapportType}
          onChange={(e) =>
            setRapportType(e.target.value as "financier" | "resultats")
          }
          className="max-w-xs"
        >
          <option value="financier">Rapport financier</option>
          <option value="resultats">Résultats de classe</option>
        </Select>
        {rapportType === "financier" ? (
          <Select
            value={anneeId}
            onChange={(e) => setAnneeId(e.target.value)}
            className="max-w-xs"
          >
            <option value="">Année scolaire</option>
            {annees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
              </option>
            ))}
          </Select>
        ) : (
          <div className="flex flex-wrap gap-4">
            <Select
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Classe</option>
              {sortedSalles.map((s) => (
                <option key={s.id} value={s.id}>
                  {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
                </option>
              ))}
            </Select>
            <Select
              value={periodeId}
              onChange={(e) => setPeriodeId(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Période</option>
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </Select>
          </div>
        )}
        {canExport ? (
          <ExportButton
            label="Rapport"
            url={exportUrl}
            params={exportParams}
            pdfFilename={`rapport-${rapportType}.pdf`}
            excelFilename={`rapport-${rapportType}.xlsx`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sélectionnez les paramètres requis.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
