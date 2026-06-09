import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { ROUTES } from "@/lib/constants";
import { canAccessPath } from "@/lib/route-access";
import { useAuthStore } from "@/stores/authStore";

interface TenantPermissionGuardProps {
  children: React.ReactNode;
}

export function TenantPermissionGuard({
  children,
}: TenantPermissionGuardProps): React.JSX.Element | null {
  const location = useLocation();
  const navigate = useNavigate();
  const menuAccess = useMenuAccess();
  const user = useAuthStore((s) => s.user);
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const hasPermission = useHasPermission();

  const ready = permissionsLoaded && user !== null;

  const allowed = ready && canAccessPath(location.pathname, menuAccess, hasPermission);

  useEffect(() => {
    if (ready && !allowed) {
      navigate(ROUTES.dashboard, { replace: true });
    }
  }, [allowed, navigate, ready]);

  if (!ready) {
    return <LoadingSpinner label="Chargement des accès…" />;
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
