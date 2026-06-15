import { Download, FileText, IdCard } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { ELEVES_API } from "@/lib/eleves-api";
import { useToastStore } from "@/stores/toastStore";

interface DocumentsPanelProps {
  eleveId: string;
  matricule: string;
  disabled?: boolean;
}

type DocType = "carte" | "attestation" | "certificat";

const DOCS: { type: DocType; label: string; icon: React.ComponentType<{ className?: string }> }[] =
  [
    { type: "carte", label: "Carte scolaire", icon: IdCard },
    { type: "attestation", label: "Attestation de scolarité", icon: FileText },
    { type: "certificat", label: "Certificat de scolarité", icon: Download },
  ];

export function DocumentsPanel({
  eleveId,
  matricule,
  disabled = false,
}: DocumentsPanelProps): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [downloading, setDownloading] = useState<DocType | null>(null);

  const handleDownload = async (type: DocType): Promise<void> => {
    const paths: Record<DocType, string> = {
      carte: ELEVES_API.carteScolaire(eleveId),
      attestation: ELEVES_API.attestation(eleveId),
      certificat: ELEVES_API.certificat(eleveId),
    };
    const names: Record<DocType, string> = {
      carte: `carte-scolaire-${matricule}.pdf`,
      attestation: `attestation-${matricule}.pdf`,
      certificat: `certificat-${matricule}.pdf`,
    };

    setDownloading(type);
    try {
      await downloadPdf(paths[type], names[type]);
      toast(`${DOCS.find((d) => d.type === type)?.label} téléchargé`);
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {DOCS.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant="outline"
            disabled={disabled || downloading !== null}
            onClick={() => void handleDownload(type)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {downloading === type ? "Téléchargement…" : label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
