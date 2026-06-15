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

export interface TenantPublicInfo {
  existe: boolean;
  nom: string | null;
  logo_url: string | null;
  suspendu?: boolean;
}

export interface LoginPayload {
  tenant_slug?: string;
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

export interface UtilisateurTenantItem {
  id: string;
  tenant_id: string;
  email: string;
  nom: string;
  prenom: string;
  role: RoleUtilisateur;
}

export interface MotDePasseTemporaireResponse {
  mot_de_passe_temporaire: string;
}

export interface UtilisateurUpdatePayload {
  nom?: string;
  prenom?: string;
  email?: string;
}

export interface UtilisateurPermissionsResponse {
  utilisateur_id: string;
  permissions: string[];
}

export interface UtilisateurPermissionsUpdate {
  permissions: string[];
}

export interface ChangePasswordPayload {
  ancien_mot_de_passe: string;
  nouveau_mot_de_passe: string;
  confirmation: string;
}

export type StatutEleve = "actif" | "transfere" | "exclu";
export type StatutInscription = "inscrit" | "transfere" | "abandonne";
export type TypeAbsence = "absence" | "retard";

export interface SalleInscriptionBrief {
  id: string;
  nom: string;
  nom_salle: string | null;
  niveau_nom?: string | null;
}

export interface Inscription {
  id: string;
  eleve_id: string;
  classe_id: string;
  annee_scolaire_id: string;
  date_inscription: string;
  statut: StatutInscription;
  created_at: string;
  updated_at: string | null;
  salle_nom?: string | null;
  salle?: SalleInscriptionBrief | null;
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
  salle_nom?: string | null;
  /** Salle active (inscription en cours). */
  salle_id?: string | null;
  /** @deprecated Utiliser `salle_nom`. */
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
  salle_active_nom?: string | null;
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

export type StatutEnseignant = "actif" | "inactif" | "conge";

export interface Enseignant {
  id: string;
  tenant_id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  adresse: string | null;
  statut: StatutEnseignant;
  date_embauche: string | null;
  salaire_base: number;
  matieres: string[];
  classes: string[];
}

/** Niveau scolaire (table `classes`, ex-niveau). */
export interface ClasseNiveau {
  id: string;
  tenant_id: string;
  cycle_id: string;
  nom: string;
  ordre: number;
  valeur_systeme_ref: string | null;
}

/** Division physique (table `salles`, ex-classe). */
export interface Salle {
  id: string;
  tenant_id: string;
  classe_id: string;
  annee_scolaire_id: string;
  nom: string;
  nom_salle: string | null;
  capacite: number | null;
}

/** @deprecated Utiliser `Salle`. */
export type Classe = Salle;

export interface AnneeScolaire {
  id: string;
  tenant_id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  est_active: boolean;
}

export type TypeEvaluation = "chiffree" | "qualitative";
export type TypeBulletin = "chiffre" | "competences";

export interface Cycle {
  id: string;
  tenant_id: string;
  nom: string;
  description: string | null;
  ordre: number;
  type_evaluation: TypeEvaluation;
  note_max: number | null;
  note_passage: number | null;
  arrondi: number | null;
  valeur_systeme_ref: string | null;
}

export interface CycleUpdatePayload {
  nom?: string;
  description?: string | null;
  ordre?: number;
  type_evaluation?: TypeEvaluation;
  note_max?: number | null;
  note_passage?: number | null;
  arrondi?: number | null;
  valeur_systeme_ref?: string | null;
}

/** @deprecated Utiliser `ClasseNiveau`. */
export type Niveau = ClasseNiveau;

export interface Periode {
  id: string;
  tenant_id: string;
  annee_scolaire_id: string;
  nom: string;
  date_debut: string;
  date_fin: string;
  ordre: number;
}

export interface SequenceEvaluation {
  id: string;
  tenant_id: string;
  cycle_id: string;
  periode_id: string;
  nom: string;
  date_debut: string | null;
  date_fin: string | null;
  ordre: number;
}

export interface Matiere {
  id: string;
  tenant_id: string;
  classe_id: string;
  nom: string;
  coefficient: number;
  note_max: number | null;
  note_max_effective?: number | null;
  est_obligatoire: boolean;
  est_domaine_competence: boolean;
  ordre: number;
  est_active: boolean;
  enseignant_principal_id: string | null;
  enseignant_assistant_id: string | null;
  cycle_id?: string | null;
  cycle_nom?: string | null;
  classe_nom?: string | null;
  enseignant_principal_nom?: string | null;
  enseignant_assistant_nom?: string | null;
}

export interface SalleEffectif {
  salle_id: string;
  effectif: number;
  capacite: number | null;
  est_complete: boolean;
}

/** @deprecated Utiliser `SalleEffectif`. */
export type ClasseEffectif = SalleEffectif;

export interface ValeurSysteme {
  id: string;
  categorie: string;
  valeur: string;
  metadata_json: Record<string, string | number | null | boolean>;
  ordre: number;
  actif: boolean;
}

export interface WizardPeriodeItem {
  periode: string;
  date_debut: string;
  date_fin: string;
}

export interface WizardClasseItem {
  classe: string;
  cycle: string;
}

export interface WizardSalleItem {
  classe: string;
  nom_salle: string;
  capacite: number;
}

export interface WizardMatiereItem {
  classe: string;
  nom: string;
  coefficient: number;
  est_domaine_competence?: boolean;
}

export interface WizardEtablissementData {
  annee_scolaire: string;
  periodes: WizardPeriodeItem[];
  cycles_selectionnes: string[];
  classes_selectionnees: WizardClasseItem[];
  salles: WizardSalleItem[];
  matieres: WizardMatiereItem[];
}

export interface WizardEtablissementResponse {
  annee_scolaire_id: string;
  periodes_creees: number;
  classes_creees: number;
  salles_creees: number;
  matieres_creees: number;
  message: string;
}

export interface EtablissementStructure {
  cycles: Array<
    Cycle & {
      classes: Array<
        ClasseNiveau & {
          salles: Salle[];
          matieres: Matiere[];
        }
      >;
    }
  >;
  annees_scolaires: AnneeScolaire[];
  annee_active: AnneeScolaire | null;
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
  matiere_id: string | null;
  periode_id: string | null;
  sequence_id?: string | null;
  classe_id: string;
  valeur: number | null;
  valeur_qualitative: string | null;
  appreciation: string | null;
  saisi_par?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface SituationEleve {
  eleve_id: string;
  annee_scolaire_id: string;
  total_du: number;
  total_paye: number;
  reste_a_payer: number;
  frais: Array<{
    frais_id: string;
    libelle: string;
    montant: number;
    montant_paye: number;
    reste: number;
  }>;
}

export interface NoteCreatePayload {
  eleve_id: string;
  matiere_id: string;
  periode_id: string;
  classe_id: string;
  valeur?: number;
  valeur_qualitative?: string;
  appreciation?: string;
}

export interface BulletinLigne {
  id: string;
  bulletin_id: string;
  matiere_id: string;
  note: number | null;
  moyenne_classe: number | null;
  coefficient: number | null;
  statut_competence: string | null;
  appreciation: string | null;
}

export interface Bulletin {
  id: string;
  tenant_id: string;
  eleve_id: string;
  classe_id: string;
  periode_id: string;
  moyenne_generale: number | string | null;
  rang: number | null;
  effectif_classe: number | null;
  mention: string | null;
  appreciation_generale: string | null;
  type_bulletin: TypeBulletin;
  statut: StatutBulletin;
  valide_par: string | null;
  date_validation: string | null;
  created_at: string;
  updated_at: string | null;
  lignes?: BulletinLigne[];
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
  type_evaluation: TypeEvaluation;
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
  classe_id: string;
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

export interface AbonnementExpirantItem {
  abonnement_id: string;
  tenant_id: string;
  tenant_nom: string;
  plan_nom: string;
  date_fin: string;
}

export interface TenantSansPaiementItem {
  tenant_id: string;
  tenant_nom: string;
  jours_sans_paiement: number;
}

export interface DashboardStats {
  nb_tenants_actifs: number;
  nb_tenants_suspendus: number;
  nb_eleves_total: number;
  nb_utilisateurs_total: number;
  revenus_mois_courant: number;
  revenus_mois_precedent: number;
  nouveaux_tenants_mois: number;
  abonnements_expirant_7j: AbonnementExpirantItem[];
  tenants_sans_paiement: TenantSansPaiementItem[];
}

export type StatutAbonnement = "actif" | "suspendu" | "expire" | "resilie";

export interface AbonnementDetail {
  id: string;
  tenant_id: string;
  tenant_nom: string;
  plan_id: string;
  plan_nom: string;
  date_debut: string;
  date_fin: string | null;
  statut: StatutAbonnement;
  montant: number;
}

export interface AbonnementCreatePayload {
  tenant_id: string;
  plan_id: string;
  duree_mois: number;
}

export type StatutFactureTenant = "payee" | "impayee" | "annulee";

export interface FactureDetail {
  id: string;
  tenant_id: string;
  tenant_nom: string;
  abonnement_id: string;
  montant: number;
  description: string;
  statut: StatutFactureTenant;
  date_echeance: string;
  date_paiement: string | null;
  created_at: string;
}

export interface FactureCreatePayload {
  tenant_id: string;
  montant: string;
  description: string;
}

export interface RevenusMoisItem {
  mois: number;
  revenus: number;
  nb_factures: number;
}

export interface RevenusParMois {
  annee: number;
  mois: RevenusMoisItem[];
  total_annuel: number;
}

export interface NotificationDetail {
  id: string;
  tenant_id: string | null;
  cible: string;
  tenant_nom: string | null;
  titre: string;
  message: string;
  emetteur_id: string | null;
  emetteur_nom: string | null;
  created_at: string;
}

export interface NotificationCreatePayload {
  titre: string;
  message: string;
}

export interface RepartitionPlanItem {
  plan: string;
  nb_tenants: number;
}

export interface EvolutionInscriptionItem {
  mois: string;
  nb: number;
}

export interface TopTenantItem {
  tenant: string;
  nb_eleves: number;
}

export interface StatistiquesPlateforme {
  repartition_par_plan: RepartitionPlanItem[];
  evolution_inscriptions: EvolutionInscriptionItem[];
  top_tenants_actifs: TopTenantItem[];
  taux_utilisation_modules: Record<string, number>;
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

export interface PlanUpdatePayload {
  nom?: string;
  prix_mensuel?: string;
  max_eleves?: number;
  max_utilisateurs?: number;
  fonctionnalites?: Record<string, boolean | string | number>;
}
