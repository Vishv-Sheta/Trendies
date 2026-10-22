variable "kubeconfig_path" {
  type        = string
  description = "Path to the local kubeconfig file"
  default     = "~/.kube/config"
}

variable "namespace_name" {
  type        = string
  description = "Kubernetes namespace for the Trendies application"
  default     = "trendies"
}

variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "development"
}
