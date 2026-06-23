terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend S3 à activer en Phase 3
  # backend "s3" {
  #   bucket = "kalanko-terraform-state"
  #   key    = "prod/terraform.tfstate"
  #   region = "eu-west-3"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "KALANKO"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
