# Fixture VERTE de oracle-serveur-de-banc (TF-2414) — le même banc : le serveur lancé par Start-Process est arrêté par Stop-Process dans un finally.
$serveur = Start-Process -FilePath 'npx.cmd' -ArgumentList 'wrangler pages dev ./dist --port 8788' -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Seconds 5
    node oracle-a11y.mjs http://localhost:8788/
} finally {
    Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
}
