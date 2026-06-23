import { School } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPageGeneric(): React.JSX.Element {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return;
    navigate(`/login/${normalized}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <School className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Connexion KALANKO</CardTitle>
          <p className="text-sm text-muted-foreground">
            Saisissez l&apos;identifiant de votre établissement
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slug">Établissement</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ecole-liberte"
                required
                autoComplete="organization"
              />
            </div>
            <Button type="submit" className="w-full">
              Continuer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
