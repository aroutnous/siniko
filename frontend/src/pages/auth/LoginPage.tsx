import { useQuery } from "@tanstack/react-query";
import { AlertCircle, School } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api, getErrorMessage } from "@/lib/api";
import { getPostLoginRoute } from "@/lib/auth-routes";
import { ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/stores/authStore";
import type { TenantPublicInfo } from "@/types";

export function LoginPage(): React.JSX.Element {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: tenantInfo, isLoading: loadingTenant } = useQuery({
    queryKey: ["tenant-public", slug],
    queryFn: async () => {
      const { data } = await api.get<TenantPublicInfo>(`/auth/tenant/${slug}`);
      return data;
    },
    enabled: Boolean(slug),
    retry: false,
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!slug) return;
    setError(null);
    setLoading(true);
    try {
      const response = await login({
        tenant_slug: slug,
        email: email.trim(),
        password,
      });
      navigate(getPostLoginRoute(response.role));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="font-medium">Lien de connexion invalide</p>
          <Link to={ROUTES.login} className="mt-4 inline-block text-sm text-primary">
            Retour à la connexion
          </Link>
        </Card>
      </div>
    );
  }

  if (loadingTenant) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner label="Chargement de l'établissement…" />
      </div>
    );
  }

  if (tenantInfo?.suspendu) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h1 className="text-lg font-semibold">Établissement suspendu</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cet établissement est temporairement indisponible. Contactez l&apos;administration.
          </p>
        </Card>
      </div>
    );
  }

  if (!tenantInfo?.existe) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold">Établissement introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun établissement ne correspond à ce lien.
          </p>
          <Link to={ROUTES.login} className="mt-4 inline-block text-sm text-primary">
            Retour à la connexion
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {tenantInfo.logo_url ? (
            <img
              src={tenantInfo.logo_url}
              alt={tenantInfo.nom ?? slug}
              className="mx-auto mb-3 h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <School className="h-6 w-6 text-primary" />
            </div>
          )}
          <CardTitle>{tenantInfo.nom ?? slug}</CardTitle>
          <p className="text-sm text-muted-foreground">Connexion à votre espace KALANKO</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="directeur@ecole.ml"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
