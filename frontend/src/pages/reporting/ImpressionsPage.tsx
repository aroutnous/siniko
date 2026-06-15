import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PrintButton } from "@/components/reporting/PrintButton";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API } from "@/lib/finance-api";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import { REPORTING_API } from "@/lib/reporting-api";
import { getEleveClasseId } from "@/lib/eleve-utils";
import { formatDecimal } from "@/lib/pedagogie-utils";
import type {
  Bulletin,
  DossierEleve,
  Eleve,
  Paiement,
  Periode,
  Salle,
} from "@/types";

export function ImpressionsPage(): React.JSX.Element {
  const [eleveSearch, setEleveSearch] = useState("");
  const [eleveQuery, setEleveQuery] = useState("");
  const [selectedEleveId, setSelectedEleveId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [classeListeId, setClasseListeId] = useState("");
  const [attestationEleveId, setAttestationEleveId] = useState("");

  const { data: searchResults = [] } = useQuery({
    queryKey: ["impressions-eleves", eleveQuery],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, {
        params: { query: eleveQuery },
      });
      return data;
    },
    enabled: eleveQuery.trim().length >= 2,
  });

  const { data: dossier } = useQuery({
    queryKey: ["impressions-dossier", selectedEleveId],
    queryFn: async () => {
      const { data } = await api.get<DossierEleve>(ELEVES_API.dossier(selectedEleveId));
      return data;
    },
    enabled: Boolean(selectedEleveId),
  });

  const classeId = dossier ? getEleveClasseId(dossier) : "";

  const { data: bulletins = [] } = useQuery({
    queryKey: ["impressions-bulletins", classeId, periodeId],
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

  const { data: paiements = [] } = useQuery({
    queryKey: ["impressions-paiements"],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.transactions);
      return data;
    },
  });

  const paiementMatch = useMemo(() => {
    const term = refSearch.trim().toLowerCase();
    if (!term) return null;
    return (
      paiements.find((p) => p.reference_transaction?.toLowerCase().includes(term)) ??
      paiements.find((p) => p.id.toLowerCase().includes(term)) ??
      null
    );
  }, [paiements, refSearch]);

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { data: attestationResults = [] } = useQuery({
    queryKey: ["attestation-eleves", attestationEleveId],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, {
        params: { query: attestationEleveId },
      });
      return data;
    },
    enabled: attestationEleveId.trim().length >= 2,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulletins scolaires</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Rechercher élève…"
              value={eleveSearch}
              onChange={(e) => setEleveSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setEleveQuery(eleveSearch)}
            />
            <Button variant="outline" onClick={() => setEleveQuery(eleveSearch)}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {searchResults.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {searchResults.map((e) => (
                <Button
                  key={e.id}
                  size="sm"
                  variant={selectedEleveId === e.id ? "default" : "outline"}
                  onClick={() => setSelectedEleveId(e.id)}
                >
                  {e.matricule} — {e.nom} {e.prenom}
                </Button>
              ))}
            </div>
          ) : null}
          {selectedEleveId ? (
            <>
              <Select
                value={periodeId}
                onChange={(e) => setPeriodeId(e.target.value)}
                className="max-w-[220px]"
              >
                <option value="">Période</option>
                {periodes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </Select>
              {eleveBulletins.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun bulletin publié pour cet élève.
                </p>
              ) : (
                <ul className="space-y-2">
                  {eleveBulletins.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div>
                        <Badge variant="success">Publié</Badge>
                        <span className="ml-2 text-sm">
                          Moy. {formatDecimal(b.moyenne_generale)} — Rang {b.rang}
                        </span>
                      </div>
                      <PrintButton
                        url={REPORTING_API.impressionBulletin(b.id)}
                        filename={`bulletin-${b.id}.pdf`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reçus de paiement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Référence transaction</Label>
            <Input
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              placeholder="Référence ou ID paiement"
            />
          </div>
          {paiementMatch ? (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="text-sm">
                <p className="font-medium">
                  {Number(paiementMatch.montant_paye).toLocaleString("fr-FR")} FCFA
                </p>
                <p className="text-muted-foreground">
                  {paiementMatch.reference_transaction ?? paiementMatch.id}
                </p>
              </div>
              <PrintButton
                url={REPORTING_API.impressionRecu(paiementMatch.id)}
                filename={`recu-${paiementMatch.reference_transaction ?? paiementMatch.id}.pdf`}
              />
            </div>
          ) : refSearch ? (
            <p className="text-sm text-muted-foreground">Aucun paiement trouvé.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste de classe</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={classeListeId}
            onChange={(e) => setClasseListeId(e.target.value)}
            className="max-w-[220px]"
          >
            <option value="">Sélectionner une classe</option>
            {sortedSalles.map((s) => (
              <option key={s.id} value={s.id}>
                {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
              </option>
            ))}
          </Select>
          <PrintButton
            url={REPORTING_API.impressionListeClasse(classeListeId)}
            filename={`liste-classe-${classeListeId}.pdf`}
            disabled={!classeListeId}
            label="Imprimer liste"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attestations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Rechercher élève (nom ou matricule)…"
            value={attestationEleveId}
            onChange={(e) => setAttestationEleveId(e.target.value)}
          />
          {attestationResults.length > 0 ? (
            <ul className="space-y-2">
              {attestationResults.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <span className="text-sm">
                    {e.matricule} — {e.nom} {e.prenom}
                  </span>
                  <PrintButton
                    url={REPORTING_API.impressionAttestation(e.id)}
                    filename={`attestation-${e.matricule}.pdf`}
                    label="Attestation"
                  />
                </li>
              ))}
            </ul>
          ) : attestationEleveId.trim().length >= 2 ? (
            <p className="text-sm text-muted-foreground">Aucun élève trouvé.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
