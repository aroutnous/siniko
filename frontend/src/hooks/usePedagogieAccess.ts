import { useHasPermission } from "@/hooks/useHasPermission";
import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface PedagogieAccess {
  role: RoleUtilisateur;
  canAccessNotes: boolean;
  canAccessBulletins: boolean;
  canAccessResultats: boolean;
  canAccessHistorique: boolean;
  canSaveNotes: boolean;
  canGenerateBulletins: boolean;
  canLoadBulletins: boolean;
  canValidateBulletins: boolean;
  canPublishBulletins: boolean;
}

export function usePedagogieAccess(): PedagogieAccess {
  const role = useAuthStore((s) => s.user?.role ?? "secretaire");
  const hasPermission = useHasPermission();

  return {
    role,
    canAccessNotes: hasPermission("notes.read") || hasPermission("notes.write"),
    canAccessBulletins:
      hasPermission("bulletins.read") ||
      hasPermission("bulletins.write") ||
      hasPermission("bulletins.validate"),
    canAccessResultats: hasPermission("notes.read") || hasPermission("bulletins.read"),
    canAccessHistorique: hasPermission("notes.read"),
    canSaveNotes: hasPermission("notes.write"),
    canGenerateBulletins: hasPermission("bulletins.write"),
    canLoadBulletins: hasPermission("bulletins.read") || hasPermission("bulletins.write"),
    canValidateBulletins: hasPermission("bulletins.validate"),
    canPublishBulletins: hasPermission("bulletins.publish"),
  };
}
