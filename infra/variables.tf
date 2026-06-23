variable "aws_region" {
  description = "Région AWS"
  type        = string
  default     = "eu-west-3"
}

variable "environment" {
  description = "Environnement (staging, production)"
  type        = string
  default     = "staging"
}

variable "project_name" {
  description = "Nom du projet"
  type        = string
  default     = "kalanko"
}

variable "db_password" {
  description = "Mot de passe PostgreSQL"
  type        = string
  sensitive   = true
}
