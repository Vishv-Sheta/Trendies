terraform {
  required_version = ">= 1.5.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

provider "kubernetes" {
  config_path = var.kubeconfig_path
}

# -------------------------------------------------------------
# Namespace Definition
# -------------------------------------------------------------
resource "kubernetes_namespace" "trendies" {
  metadata {
    name = var.namespace_name
    labels = {
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}

# -------------------------------------------------------------
# Application Configuration
# -------------------------------------------------------------
resource "kubernetes_config_map" "trendies_config" {
  metadata {
    name      = "trendies-config"
    namespace = kubernetes_namespace.trendies.metadata[0].name
  }

  data = {
    PORT        = "3000"
    NODE_ENV    = var.environment
    MONGODB_URI = "mongodb://mongo:27017/trendies"
  }
}

# -------------------------------------------------------------
# Local Demonstration Persistent Volume Claim
# -------------------------------------------------------------
resource "kubernetes_persistent_volume_claim" "mongo_pvc" {
  metadata {
    name      = "mongo-pvc"
    namespace = kubernetes_namespace.trendies.metadata[0].name
  }

  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = "1Gi"
      }
    }
  }
}
