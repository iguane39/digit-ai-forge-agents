# Fixture FICTIVE (TF-1492) : un commentaire a coupé le groupe d'alignement, le correctif n'a pas
# réaligné les signes égal qui le suivent — terraform fmt -check rend 3 (T1).
locals {
  environnement = "prd"
  # date d'effet du budget, calculée à la création
  debut_budget = formatdate("YYYY-MM-01'T'00:00:00'Z'", timestamp())
  montant   = 100
}

output "debut_budget" {
  value = local.debut_budget
}
