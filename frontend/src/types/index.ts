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

export interface UtilisateurListItem {
  id: string;
  tenant_id: string;
  email: string;
  nom: string;
  prenom: string;
  role: RoleUtilisateur;
  statut: StatutUtilisateur;
}

export interface UtilisateurCreatePayload {
  email: string;
  nom: string;
  prenom: string;
  role: "directeur" | "secretaire" | "comptable";
  mot_de_passe?: string;
}

export interface UtilisateurCreateResponse {
  id: string;
  tenant_id: string;
  email: string;
  nom: string;
  prenom: string;
  role: RoleUtilisateur;
  mot_de_passe_temporaire: string | null;
}

export interface ChangePasswordPayload {
  ancien_mot_de_passe: string;
  nouveau_mot_de_passe: string;
  confirmation: string;
}

export type StatutEleve = "actif" | "transfere" | "exclu";
export type StatutInscription = "inscrit" | "transfere" | "abandonne";
export type TypeAbsence = "absence" | "retard";

export interface Inscription {
  id: string;
  eleve_id: string;
  classe_id: string;
  annee_scolaire_id: string;
  date_inscription: string;
  statut: StatutInscription;
  created_at: string;
  updated_at: string | null;
}

export interface Absence {
  id: string;
  eleve_id: string;
  classe_id: string;
  date_absence: string;
  type: TypeAbsence;
  justifiee: boolean;
  motif: string | null;
  saisi_par: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AbsenceStatistiques {
  classe_id: string;
  total: number;
  absences: number;
  retards: number;
  justifiees: number;
  non_justifiees: number;
}

export interface ClasseAbsencesResponse {
  absences: Absence[];
  statistiques: AbsenceStatistiques;
}

export interface EleveInscrireResponse {
  eleve: Eleve;
  inscription: Inscription;
}

export interface EleveListItem extends Eleve {
  classe_nom?: string;
}

export interface AbsenceCreatePayload {
  classe_id: string;
  date_absence: string;
  type: TypeAbsence;
  justifiee?: boolean;
  motif?: string;
}

export interface DossierEleve {
  eleve: Eleve;
  inscriptions: Inscription[];
  absences: Absence[];
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
  statut: StatutEleve;
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
}

export interface Cycle {
  id: string;
  tenant_id: string;
  nom: string;
  description: string | null;
  ordre: number;
}

export interface Niveau {
  id: string;
  tenant_id: string;
  cycle_id: string;
  nom: string;
  ordre: number;
}

export interface Periode {
  id: string;
  tenant_id: string;
  annee_scolaire_id: string;
  nom: string;
  date_debut: string;
  date_fin: string;
  ordre: number;
}

export interface Matiere {
  id: string;
  tenant_id: string;
  niveau_id: string;
  nom: string;
  coefficient: number;
  est_active: boolean;
}

export interface ConfigNotation {
  id: string;
  tenant_id: string;
  note_max: number;
  note_passage: number;
  arrondi: number;
}

export interface ClasseEffectif {
  classe_id: string;
  effectif: number;
  capacite_max: number | null;
  est_complete: boolean;
}

export type StatutBulletin = "brouillon" | "valide" | "publie";
export type MentionScolaire =
  | "Très Bien"
  | "Bien"
  | "Assez Bien"
  | "Passable"
  | "Insuffisant";

export interface Note {
  id: string;
  tenant_id?: string;
  eleve_id: string;
  matiere_id: string;
  periode_id: string;
  classe_id: string;
  valeur: number;
  appreciation: string | null;
  saisi_par?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface NoteCreatePayload {
  eleve_id: string;
  matiere_id: string;
  periode_id: string;
  classe_id: string;
  valeur: number;
  appreciation?: string;
}

export interface Bulletin {
  id: string;
  tenant_id: string;
  eleve_id: string;
  classe_id: string;
  periode_id: string;
  moyenne_generale: number | null;
  rang: number | null;
  effectif_classe: number | null;
  mention: string | null;
  appreciation_generale: string | null;
  statut: StatutBulletin;
  valide_par: string | null;
  date_validation: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ClassementEleve {
  eleve_id: string;
  moyenne_generale: number | null;
  rang: number | null;
  mention: string | null;
}

export interface MoyenneMatiere {
  matiere_id: string;
  moyenne: number;
}

export interface ResultatsClasse {
  classe_id: string;
  periode_id: string;
  effectif: number;
  moyennes_par_matiere: MoyenneMatiere[];
  classement: ClassementEleve[];
  taux_reussite: number;
}

export type ModePaiement = "especes" | "mobile_money" | "virement" | "cheque";
export type StatutPaiement = "en_attente" | "valide" | "annule";
export type StatutSalaire = "en_attente" | "paye";

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
  statut: StatutPaiement;
  created_at: string;
  updated_at: string | null;
}

export interface FraisScolaire {
  id: string;
  tenant_id?: string;
  libelle: string;
  montant: number;
  niveau_id: string;
  annee_scolaire_id: string;
  est_obligatoire: boolean;
  created_at?: string;
  updated_at?: string | null;
}

export interface Depense {
  id: string;
  tenant_id: string;
  categorie: string;
  libelle: string;
  montant: number;
  date_depense: string;
  saisi_par: string | null;
  justificatif_url: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Salaire {
  id: string;
  tenant_id: string;
  employe_id: string;
  mois: string;
  montant_brut: number;
  montant_net: number;
  statut: StatutSalaire;
  date_paiement: string | null;
  valide_par: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Caisse {
  id: string;
  tenant_id: string;
  date: string;
  solde_ouverture: number;
  total_entrees: number;
  total_sorties: number;
  solde_cloture: number;
  cloture_par: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CaisseJour {
  caisse: Caisse;
  solde_actuel: number;
}

export interface Impaye {
  eleve_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  total_du: number;
  total_paye: number;
  montant_restant: number;
}

export interface SituationFinanciere {
  annee_scolaire_id: string;
  total_recettes: number;
  total_depenses: number;
  total_salaires: number;
  solde: number;
}

export interface TableauBordResponse {
  tenant_id: string;
  role: RoleUtilisateur;
  generated_at: string;
  donnees: Record<string, number | string | unknown>;
}

export interface StatsClasseItem {
  classe_id: string;
  nom: string;
  effectif: number;
}

export interface StatsNiveauItem {
  niveau_id: string;
  nom: string;
  effectif: number;
}

export interface StatsCycleItem {
  cycle_id: string;
  nom: string;
  effectif: number;
}

export interface StatsPeriodeItem {
  periode_id: string;
  nom: string;
  taux_reussite_moyen: number;
}

export interface StatsEleves {
  total_eleves: number;
  par_classe: StatsClasseItem[];
  par_niveau: StatsNiveauItem[];
  par_cycle: StatsCycleItem[];
}

export interface StatsResultats {
  par_periode: StatsPeriodeItem[];
  taux_reussite_moyen: number;
}

export interface StatsFinancieres {
  total_recettes: number;
  total_depenses: number;
  taux_recouvrement: number;
}

export interface StatistiquesGlobales {
  tenant_id: string;
  annee_scolaire_id: string;
  generated_at: string;
  eleves: StatsEleves;
  resultats: StatsResultats;
  financieres: StatsFinancieres;
  taux_paiement: number;
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
