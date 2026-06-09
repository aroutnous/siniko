import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

import { API_BASE_URL, ROUTES, SESSION_KEYS } from "@/lib/constants";
import type { ApiError, LoginResponse } from "@/types";

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

function getStoredToken(): string | null {
  return sessionStorage.getItem(SESSION_KEYS.token);
}

function setStoredToken(token: string): void {
  sessionStorage.setItem(SESSION_KEYS.token, token);
}

function clearAuthStorage(): void {
  sessionStorage.removeItem(SESSION_KEYS.token);
  sessionStorage.removeItem(SESSION_KEYS.tenantSlug);
}

function redirectToLogin(): void {
  clearAuthStorage();
  if (window.location.pathname !== ROUTES.login) {
    window.location.href = ROUTES.login;
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes("/auth/login")) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const token = getStoredToken();
      if (!token) {
        redirectToLogin();
        return Promise.reject(error);
      }

      const { data } = await axios.post<LoginResponse>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setStoredToken(data.access_token);
      refreshQueue.forEach((cb) => cb(data.access_token));
      refreshQueue = [];

      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return api(originalRequest);
    } catch {
      refreshQueue = [];
      redirectToLogin();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((d) => d.msg).join(", ");
    }
    if (error.response?.status === 401) return "Identifiants invalides ou session expirée";
    if (error.response?.status === 403) return "Accès refusé";
    if (error.response?.status === 429) return "Trop de tentatives. Réessayez plus tard.";
  }
  return "Une erreur est survenue";
}

export { api, clearAuthStorage, getStoredToken, setStoredToken };
