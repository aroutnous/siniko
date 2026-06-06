import { useQuery } from "@tanstack/react-query";
import { Download, FileText, IdCard } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { downloadPdf } from "@/lib/download";
import type { DossierEleve } from "@/types";

export function EleveDossierPage(): React.JSX.Element {
  const { eleveId } = useParams<{ eleveId: string }>();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["eleve-dossier", eleveId],
    queryFn: async () => {
      const { data: dossier } = await api.get<DossierEleve>(`/eleves/${eleveId}/dossier`);
      return dossier;
    },
    enabled: Boolean(eleveId),
  });

  const handleDownload = async (type: "carte" | "attestation" | "certificat"): Promise<void> => {
    if (!eleveId) return;
    const paths = {
      carte: `/eleves/${eleveId}/carte-scolaire`,
      attestation: `/eleves/${eleveId}/attestation`,
      certificat: `/eleves/${eleveId}/certificat`,
    };
    const names = {
      carte: `carte-scolaire-${eleveId}.pdf`,
      attestation: `attestation-${eleveId}.pdf`,
      certificat: `certificat-${eleveId}.pdf`,
    };
    setDownloading(type);
    setError(null);
    try {
      await downloadPdf(paths[type], names[type]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  if (isLoading || !data) {
    return <LoadingSpinner />;
  }

  const inscription = data.inscriptions[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.eleve.nom} ${data.eleve.prenom}`}
        description={`Matricule ${data.eleve.matricule}`}
        breadcrumb="Élèves"
        action={
          <Link to={ROUTES.eleves}>
            <Button variant="outline">Retour à la liste</Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={downloading !== null}
            onClick={() => void handleDownload("carte")}
          >
            <IdCard className="mr-2 h-4 w-4" />
            {downloading === "carte" ? "Téléchargement…" : "Carte scolaire"}
          </Button>
          <Button
            variant="outline"
            disabled={downloading !== null}
            onClick={() => void handleDownload("attestation")}
          >
            <FileText className="mr-2 h-4 w-4" />
            {downloading === "attestation" ? "Téléchargement…" : "Attestation"}
          </Button>
          <Button
            variant="outline"
            disabled={downloading !== null}
            onClick={() => void handleDownload("certificat")}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading === "certificat" ? "Téléchargement…" : "Certificat"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Statut :</span> {data.eleve.statut}
            </p>
            <p>
              <span className="font-medium">Parent :</span> {data.eleve.nom_parent ?? "—"}
            </p>
            <p>
              <span className="font-medium">Téléphone parent :</span>{" "}
              {data.eleve.telephone_parent ?? "—"}
            </p>
            {inscription ? (
              <p>
                <span className="font-medium">Inscription :</span>{" "}
                {inscription.date_inscription} — {inscription.statut}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Absences ({data.absences.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {data.absences.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune absence enregistrée</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.absences.slice(0, 5).map((absence) => (
                  <li key={absence.id}>
                    {absence.date_absence} — {absence.type}
                    {absence.justifiee ? " (justifiée)" : ""}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
