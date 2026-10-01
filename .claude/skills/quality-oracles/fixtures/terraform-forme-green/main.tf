# Fixture FICTIVE (TF-1492) : la même configuration, au format canonique de terraform fmt (T1),
# valide sans fournisseur (T2), et sa date d'effet calculée à la création (le remède de D1).
locals {
  environnement = "prd"
  # date d'effet du budget, calculée à la création
  debut_budget = formatdate("YYYY-MM-01'T'00:00:00'Z'", timestamp())
  montant      = 100
}

output "debut_budget" {
  value = local.debut_budget
}
