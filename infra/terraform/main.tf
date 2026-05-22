terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Stub — modules VPC / ECS / RDS à compléter en phase déploiement AWS.
variable "project_name" {
  description = "Nom du projet"
  type        = string
  default     = "siniko"
}

variable "aws_region" {
  description = "Région AWS"
  type        = string
  default     = "eu-west-3"
}

provider "aws" {
  region = var.aws_region
}

# Exemple de ressource pour valider terraform validate / Checkov
resource "aws_cloudwatch_log_group" "api" {
  name              = "/siniko/api"
  retention_in_days = 14

  tags = {
    Project = var.project_name
    Env     = "staging"
  }
}
