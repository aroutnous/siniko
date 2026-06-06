export type RoleUtilisateur =
  | "platform_owner"
  | "promoteur"
  | "directeur"
  | "secretaire"
  | "comptable";

export type StatutUtilisateur = "actif" | "inactif";

export interface User {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  email: string;
  nom: string;
  prenom: string;
  role: RoleUtilisateur;
  statut: StatutUtilisateur;
  derniere_connexion: string | null;
}

export interface Tenant {
  slug: string;
  nom?: string;
}

export interface LoginPayload {
  tenant_slug: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: RoleUtilisateur;
  tenant_slug: string;
}

export interface Eleve {
  id: string;
  tenant_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  date_naissance: string | null;
  lieu_naissance: string | null;
  sexe: "M" | "F" | null;
  photo_url: string | null;
  nom_parent: string | null;
  telephone_parent: string | null;
  adresse: string | null;
  statut: string;
  created_at: string;
  updated_at: string | null;
}

export interface Classe {
  id: string;
  tenant_id: string;
  niveau_id: string;
  annee_scolaire_id: string;
  nom: string;
  capacite_max: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface AnneeScolaire {
  id: string;
  tenant_id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  est_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface Note {
  id: string;
  eleve_id: string;
  matiere_id: string;
  periode_id: string;
  classe_id: string;
  valeur: number;
  appreciation: string | null;
}

export type ModePaiement = "especes" | "mobile_money" | "virement" | "cheque";

export interface Paiement {
  id: string;
  tenant_id: string;
  eleve_id: string;
  frais_id: string;
  annee_scolaire_id: string;
  montant_paye: number;
  mode_paiement: ModePaiement;
  reference_transaction: string | null;
  encaisse_par: string | null;
  date_paiement: string;
  statut: string;
  created_at: string;
  updated_at: string | null;
}

export interface FraisScolaire {
  id: string;
  libelle: string;
  montant: number;
  niveau_id: string;
  annee_scolaire_id: string;
}

export interface TableauBordResponse {
  tenant_id: string;
  role: RoleUtilisateur;
  generated_at: string;
  donnees: Record<string, number | string>;
}

export interface ApiError {
  detail: string | { msg: string }[];
}

export type StatutTenant = "actif" | "suspendu" | "inactif";

export interface PlatformTenant {
  id: string;
  nom: string;
  slug: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  logo_url: string | null;
  statut: StatutTenant;
  created_at: string;
  updated_at: string | null;
}

export interface PlatformStats {
  nb_tenants: number;
  nb_eleves_total: number;
  nb_utilisateurs_total: number;
  revenus_mois: number;
}

export interface PlanAbonnement {
  id: string;
  nom: string;
  prix_mensuel: number;
  max_eleves: number | null;
  max_utilisateurs: number | null;
  fonctionnalites: Record<string, boolean | string | number>;
  est_actif: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  utilisateur_id: string | null;
  action: string;
  table_cible: string | null;
  enregistrement_id: string | null;
  ip_address: string | null;
  resultat: string | null;
  nouvelles_valeurs: Record<string, unknown> | null;
  created_at: string;
}

export interface TenantCreatePayload {
  nom: string;
  email: string;
  plan_id: string;
  telephone?: string;
  adresse?: string;
  promoteur_email: string;
  promoteur_nom: string;
  promoteur_prenom: string;
}

export interface TenantCreateResponse {
  tenant: PlatformTenant;
  promoteur_email: string;
  mot_de_passe_temporaire: string;
}

export interface PlanCreatePayload {
  nom: string;
  prix_mensuel: string;
  max_eleves?: number;
  max_utilisateurs?: number;
  fonctionnalites?: Record<string, boolean | string | number>;
}
