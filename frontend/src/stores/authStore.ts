import { create } from "zustand";

import { api, clearAuthStorage, getStoredToken, setStoredToken } from "@/lib/api";
import { SESSION_KEYS } from "@/lib/constants";
import { normalizePermissionList } from "@/lib/permission-utils";
import { UTILISATEURS_API } from "@/lib/utilisateurs-api";
import type { LoginPayload, LoginResponse, Tenant, User, UtilisateurPermissionsResponse } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  tenant: Tenant | null;
  permissions: string[];
  permissionsLoaded: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setUser: (user: User | null) => void;
  setPermissions: (permissions: string[]) => void;
  hasPermission: (permission: string) => boolean;
  fetchPermissions: () => Promise<void>;
  hydrate: () => void;
  fetchProfile: () => Promise<void>;
}

function resolveHasPermission(
  user: User | null,
  permissions: string[],
  permission: string,
): boolean {
  if (user?.role === "promoteur") return true;
  if (permissions.includes("*")) return true;
  return permissions.includes(permission);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getStoredToken(),
  tenant: sessionStorage.getItem(SESSION_KEYS.tenantSlug)
    ? { slug: sessionStorage.getItem(SESSION_KEYS.tenantSlug) ?? "" }
    : null,
  permissions: [],
  permissionsLoaded: false,
  isAuthenticated: Boolean(getStoredToken()),

  hydrate: () => {
    const token = getStoredToken();
    const slug = sessionStorage.getItem(SESSION_KEYS.tenantSlug);
    set({
      token,
      isAuthenticated: Boolean(token),
      tenant: slug ? { slug } : null,
      permissions: [],
      permissionsLoaded: false,
    });
  },

  setPermissions: (permissions) => set({ permissions }),

  hasPermission: (permission) => {
    const { user, permissions } = get();
    return resolveHasPermission(user, permissions, permission);
  },

  fetchPermissions: async () => {
    const user = get().user;
    if (!user) {
      set({ permissions: [], permissionsLoaded: true });
      return;
    }
    if (user.role === "promoteur") {
      set({ permissions: ["*"], permissionsLoaded: true });
      return;
    }
    if (user.role === "platform_owner") {
      set({ permissions: ["platform.admin"], permissionsLoaded: true });
      return;
    }
    try {
      const { data } = await api.get<UtilisateurPermissionsResponse>(
        UTILISATEURS_API.myPermissions,
      );
      set({
        permissions: normalizePermissionList(data.permissions),
        permissionsLoaded: true,
      });
    } catch {
      set({ permissions: [], permissionsLoaded: true });
    }
  },

  login: async (payload) => {
    set({ permissionsLoaded: false, permissions: [] });
    const { data } = await api.post<LoginResponse>("/auth/login", {
      email: payload.email,
      password: payload.password,
      tenant_slug: payload.tenant_slug ?? "",
    });
    setStoredToken(data.access_token);
    if (data.tenant_slug) {
      sessionStorage.setItem(SESSION_KEYS.tenantSlug, data.tenant_slug);
    } else {
      sessionStorage.removeItem(SESSION_KEYS.tenantSlug);
    }
    set({
      token: data.access_token,
      tenant: data.tenant_slug ? { slug: data.tenant_slug } : null,
      isAuthenticated: true,
    });
    await get().fetchProfile();
    return data;
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      clearAuthStorage();
      set({
        user: null,
        token: null,
        tenant: null,
        permissions: [],
        permissionsLoaded: false,
        isAuthenticated: false,
      });
    }
  },

  refreshToken: async () => {
    const { data } = await api.post<LoginResponse>("/auth/refresh");
    setStoredToken(data.access_token);
    set({ token: data.access_token, isAuthenticated: true });
  },

  setUser: (user) => set({ user }),

  fetchProfile: async () => {
    set({ permissionsLoaded: false });
    const { data } = await api.get<User>("/auth/me");

    if (data.role === "promoteur") {
      set({
        user: data,
        permissions: ["*"],
        permissionsLoaded: true,
      });
      return;
    }

    if (data.role === "platform_owner") {
      set({
        user: data,
        permissions: ["platform.admin"],
        permissionsLoaded: true,
      });
      return;
    }

    set({ user: data, permissions: [] });
    await get().fetchPermissions();
  },
}));
