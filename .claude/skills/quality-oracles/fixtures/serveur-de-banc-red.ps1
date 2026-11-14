# Fixture ROUGE de oracle-serveur-de-banc (TF-2414) — le cas du 09/11/2026 sous PowerShell : wrangler pages dev lancé par Start-Process,
# jamais arrêté, et le banc rend la main.
$serveur = Start-Process -FilePath 'npx.cmd' -ArgumentList 'wrangler pages dev ./dist --port 8788' -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 5
node oracle-a11y.mjs http://localhost:8788/
Write-Output "banc terminé, serveur $($serveur.Id) laissé actif"
