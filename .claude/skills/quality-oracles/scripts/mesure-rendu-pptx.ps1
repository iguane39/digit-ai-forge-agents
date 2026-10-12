# mesure-rendu-pptx.ps1 - mesures de rendu d'un deck par PowerPoint (COM), pour la regle S6 d'oracle-charte-pptx-semantique (TF-1379).
# Fichier en ASCII a dessein : Windows PowerShell 5.1 lit un script sans BOM dans la page de code du poste.
#
# POURQUOI. L'alignement d'un repere (pastille « N / M ») sur la 1re ligne d'un titre ne se lit pas dans le XML :
# la 1re ligne depend de la police, de la largeur de la zone et du retour a la ligne. Lire ses bornes demande le
# moteur de rendu : TextRange.Lines(1) de PowerPoint (BoundTop, BoundHeight), en points.
#
# DISCIPLINE (celle de digit-ai-pptx/scripts/exporter-powerpoint.ps1, TF-1502). Le script ouvre une COPIE du deck, en
# lecture seule et sans fenetre, ne ferme que cette presentation, et ne quitte l'application que s'il l'a lancee
# lui-meme (aucun processus PowerPoint de cette session avant le rattachement), qu'aucune autre presentation n'est
# ouverte et qu'elle est invisible. Une instance ouverte par l'utilisateur n'est JAMAIS quittee.
#
# Usage : powershell -NoProfile -ExecutionPolicy Bypass -File mesure-rendu-pptx.ps1 -Entree <deck.pptx> -Sortie <mesures.json>
# Sortie : le fichier JSON {outil, unite, slides:[{n, formes:[{nom, texte, titre, haut, hauteur, gauche, largeur, ligne1}]}]}
# et une ligne JSON de statut sur stdout. Codes : 0 mesure faite ; 1 echec de PowerPoint ; 2 non joue (PowerPoint absent, usage).
param(
  [string]$Entree = '',
  [string]$Sortie = ''
)

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

function Write-Statut($Statut, [int]$Code) {
  [Console]::Out.WriteLine(($Statut | ConvertTo-Json -Compress -Depth 4))
  exit $Code
}

if (-not $Entree -or -not $Sortie) { Write-Statut ([ordered]@{ etat = 'non-joue'; motif = 'usage : -Entree <deck.pptx> -Sortie <mesures.json>' }) 2 }
if (-not (Test-Path -LiteralPath $Entree -PathType Leaf)) { Write-Statut ([ordered]@{ etat = 'non-joue'; motif = 'deck absent' }) 2 }

$session = (Get-Process -Id $PID).SessionId
function Get-PidsPowerPoint {
  @(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session } | ForEach-Object { $_.Id })
}
$avant = @(Get-PidsPowerPoint)
try { $app = New-Object -ComObject PowerPoint.Application }
catch { Write-Statut ([ordered]@{ etat = 'non-joue'; motif = "PowerPoint indisponible par COM : $($_.Exception.Message)" }) 2 }
$apres = @(Get-PidsPowerPoint)

# la copie a chemin unique : le deck de l'utilisateur n'est jamais ouvert
$copie = Join-Path ([System.IO.Path]::GetTempPath()) ("mesure-rendu-" + [guid]::NewGuid().ToString('N') + '.pptx')
Copy-Item -LiteralPath $Entree -Destination $copie
$pres = $null
$statut = [ordered]@{ etat = $null; motif = $null; diapositives = 0; quittee = $false }
$code = 0
try {
  $pres = $app.Presentations.Open($copie, -1, 0, 0)
  $slides = @()
  foreach ($s in $pres.Slides) {
    $formes = @()
    foreach ($sh in $s.Shapes) {
      $texte = ''
      $ligne1 = $null
      $estTitre = $false
      try { $t = [int]$sh.Type; if ($t -eq 14) { $pt = [int]$sh.PlaceholderFormat.Type; $estTitre = ($pt -eq 1 -or $pt -eq 3) } } catch { }
      if ($sh.HasTextFrame -and $sh.TextFrame.HasText) {
        $texte = ([string]$sh.TextFrame.TextRange.Text) -replace "[\r\n\v]+", ' '
        $texte = $texte.Trim()
        try {
          $l1 = $sh.TextFrame.TextRange.Lines(1)
          $ligne1 = [ordered]@{ haut = [math]::Round([double]$l1.BoundTop, 2); hauteur = [math]::Round([double]$l1.BoundHeight, 2) }
        } catch { }
      }
      if ($texte -eq '') { continue }
      $formes += [ordered]@{
        nom = [string]$sh.Name; texte = $texte; titre = $estTitre
        haut = [math]::Round([double]$sh.Top, 2); hauteur = [math]::Round([double]$sh.Height, 2)
        gauche = [math]::Round([double]$sh.Left, 2); largeur = [math]::Round([double]$sh.Width, 2)
        ligne1 = $ligne1
      }
    }
    $slides += [ordered]@{ n = [int]$s.SlideIndex; formes = $formes }
  }
  $mesures = [ordered]@{ outil = 'mesure-rendu-pptx'; unite = 'pt'; origine = 'PowerPoint, TextRange.Lines(1)'; slides = $slides }
  $json = $mesures | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($Sortie, $json, (New-Object System.Text.UTF8Encoding $false))
  $statut.etat = 'mesure'
  $statut.diapositives = $slides.Count
} catch {
  $statut.etat = 'echec'
  $statut.motif = "mesure par PowerPoint en echec : $($_.Exception.Message)"
  $code = 1
} finally {
  if ($null -ne $pres) {
    try { $pres.Close() } catch { }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) } catch { }
  }
  Remove-Item -LiteralPath $copie -Force -ErrorAction SilentlyContinue
  try {
    $lancee = ($avant.Count -eq 0) -and ($apres.Count -ge 1)
    if ($lancee -and ([int]$app.Presentations.Count -eq 0) -and ([int]$app.Visible -eq 0)) { $app.Quit(); $statut.quittee = $true }
  } catch { }
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch { }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
Write-Statut $statut $code
