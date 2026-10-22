output "namespace" {
  description = "The created Kubernetes namespace name"
  value       = kubernetes_namespace.trendies.metadata[0].name
}

output "configmap_name" {
  description = "The created ConfigMap name"
  value       = kubernetes_config_map.trendies_config.metadata[0].name
}

output "pvc_name" {
  description = "The created Mongo PVC name"
  value       = kubernetes_persistent_volume_claim.mongo_pvc.metadata[0].name
}
