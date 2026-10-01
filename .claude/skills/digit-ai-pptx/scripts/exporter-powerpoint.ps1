# exporter-powerpoint.ps1 - export d'un deck par PowerPoint (COM), skill digit-ai-pptx (TF-1502, 01/10/2026).
# Appele par scripts/exporter-pptx.mjs, qui pose le verrou entre sessions, lui donne une COPIE de
# l'entree a un chemin unique, puis assainit les polices embarquees de ce qu'il a exporte.
# Fichier en ASCII a dessein : Windows PowerShell 5.1 lit un script sans BOM dans la page de code
# du poste, et un accent y deviendrait un autre caractere.
#
# LE FAIT (lot de retours du 30/09/2026, RA-03). PowerPoint n'a qu'une instance par session
# Windows : New-Object -ComObject PowerPoint.Application s'attache a celle que l'utilisateur a deja
# ouverte. 8 scripts d'export maison sur 9 appelaient Quit() sur elle sans condition ; l'instance de
# l'utilisateur, lancee la veille sur un autre deck, s'est retrouvee sans fenetre, avec 4
# presentations inaccessibles a l'automation.
#
# LA REGLE. Ce script ne quitte JAMAIS une application qu'il n'a pas lancee. Il ne la quitte que si
# trois faits sont etablis apres la fermeture de SA presentation : (1) aucun processus PowerPoint ne
# tournait dans cette session Windows avant le rattachement, et un processus tourne apres ;
# (2) aucune autre presentation n'est ouverte dans l'instance ; (3) l'application est invisible,
# donc personne ne s'en sert. Un fait illisible vaut refus de quitter. Il ne ferme que la
# presentation qu'il a ouverte, celle de la copie a chemin unique : aucune presentation de
# l'utilisateur n'est fermee, et aucun reglage de l'application n'est modifie.
#
# OPTION -InstanceNeuve : si PowerPoint tourne deja dans cette session, refus avant tout
# rattachement (code 2). L'export ne touche alors que l'instance qu'il lance : c'est le mode des
# essais reels du self-test, et celui d'un export sans surveillance sur le poste de quelqu'un.
#
# MODE -Decision : rejoue la seule regle de decision sur des cas donnes (tableau JSON en base64),
# sans COM ni PowerPoint. C'est la preuve du self-test du skill, qui joue aussi des mutants de la
# regle : l'historique (Quit sans condition) et la garde sur le seul compte des presentations.
#
# Usage : powershell -NoProfile -ExecutionPolicy Bypass -File exporter-powerpoint.ps1
#           -Entree <copie.pptx> [-SortiePptx <export.pptx>] [-SortiePdf <export.pdf>] [-InstanceNeuve]
#         powershell -NoProfile -ExecutionPolicy Bypass -File exporter-powerpoint.ps1 -Decision -CasBase64 <json>
# Sortie : une ligne JSON sur stdout. Codes : 0 export fait ; 1 export en echec (deck illisible ou
# erreur de PowerPoint) ; 2 PowerPoint indisponible, deja lance sous -InstanceNeuve, ou usage incorrect.
param(
  [string]$Entree = '',
  [string]$SortiePptx = '',
  [string]$SortiePdf = '',
  [switch]$InstanceNeuve,
  [switch]$Decision,
  [string]$CasBase64 = ''
)

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

function Write-Rapport($Rapport, [int]$Code) {
  [Console]::Out.WriteLine(($Rapport | ConvertTo-Json -Compress -Depth 6))
  exit $Code
}

# La regle de decision, seule a dire si l'application se quitte. Faits attendus : pids_avant et
# pids_apres (processus PowerPoint de cette session avant et apres le rattachement),
# autres_presentations (presentations encore ouvertes apres la fermeture de celle de l'export),
# visible (l'application montre-t-elle une fenetre), erreur_lecture (un fait n'a pas pu etre lu).
function Get-Decision($Faits) {
  $avant = @($Faits.pids_avant | Where-Object { $null -ne $_ })
  $apres = @($Faits.pids_apres | Where-Object { $null -ne $_ })
  $autres = $Faits.autres_presentations
  $visible = $Faits.visible
  $erreur = [bool]$Faits.erreur_lecture -or ($null -eq $autres) -or ($null -eq $visible)
  $lancee = ($avant.Count -eq 0) -and ($apres.Count -ge 1)
  # Ligne de la regle : le self-test la remplace par ses mutants, ne pas la reformuler sans lui.
  $quitter = $lancee -and (-not $erreur) -and ($autres -eq 0) -and (-not $visible)
  if (-not $lancee) {
    if ($avant.Count -gt 0) { $motif = "PowerPoint tournait avant l'export (PID $($avant -join ', ')) : instance de l'utilisateur, jamais quittee" }
    else { $motif = "aucun processus PowerPoint retrouve apres le rattachement : rien ne prouve que l'export l'a lance, il ne le quitte pas" }
  }
  elseif ($erreur) { $motif = "etat de l'instance illisible : dans le doute, elle reste ouverte" }
  elseif ($autres -gt 0) { $motif = "$autres autre(s) presentation(s) ouverte(s) dans l'instance lancee par l'export : quelqu'un s'en sert, elle reste ouverte" }
  elseif ($visible) { $motif = "l'instance lancee par l'export est devenue visible : quelqu'un s'en sert, elle reste ouverte" }
  else { $motif = "instance lancee par l'export, sans autre presentation, invisible : quittee" }
  return [ordered]@{ quitter = [bool]$quitter; lancee_par_l_export = [bool]$lancee; motif = $motif }
}

if ($Decision) {
  try {
    $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CasBase64))
    # -InputObject et non un tube : PowerShell 5.1 rendrait le tableau en UN seul objet
    $cas = ConvertFrom-Json -InputObject $json
  } catch {
    Write-Rapport ([ordered]@{ etat = 'non-joue'; motif = "cas illisibles : $($_.Exception.Message)" }) 2
  }
  $decisions = @(foreach ($c in $cas) { $d = Get-Decision $c; $d.cas = $c.cas; $d })
  Write-Rapport ([ordered]@{ etat = 'decisions'; decisions = $decisions }) 0
}

if (-not $Entree -or (-not $SortiePptx -and -not $SortiePdf)) {
  Write-Rapport ([ordered]@{ etat = 'non-joue'; motif = 'usage : -Entree <copie.pptx> et au moins -SortiePptx ou -SortiePdf' }) 2
}
if (-not (Test-Path -LiteralPath $Entree -PathType Leaf)) {
  Write-Rapport ([ordered]@{ etat = 'non-joue'; motif = 'entree absente' }) 2
}

$session = (Get-Process -Id $PID).SessionId
function Get-PidsPowerPoint {
  @(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session } | ForEach-Object { $_.Id })
}

$rapport = [ordered]@{
  etat = $null; motif = $null; pids_avant = @(); pids_apres = @(); autres_presentations = $null
  visible = $null; erreur_lecture = $false; lancee_par_l_export = $false; decision = $null; quittee = $false
  pptx = $false; pdf = $false
}
$rapport.pids_avant = @(Get-PidsPowerPoint)
if ($InstanceNeuve -and $rapport.pids_avant.Count -gt 0) {
  $rapport.etat = 'non-joue'
  $rapport.motif = "PowerPoint tourne deja dans cette session (PID $($rapport.pids_avant -join ', ')) : -InstanceNeuve interdit de s'y attacher"
  Write-Rapport $rapport 2
}
try {
  $app = New-Object -ComObject PowerPoint.Application
} catch {
  $rapport.etat = 'non-joue'
  $rapport.motif = "PowerPoint indisponible par COM : $($_.Exception.Message)"
  Write-Rapport $rapport 2
}
$rapport.pids_apres = @(Get-PidsPowerPoint)
$pres = $null
$code = 0
try {
  # ReadOnly msoTrue (-1), Untitled msoFalse (0), WithWindow msoFalse (0) : aucune fenetre ouverte
  $pres = $app.Presentations.Open($Entree, -1, 0, 0)
  # ppSaveAsOpenXMLPresentation (24), EmbedTrueTypeFonts msoTrue (-1) : les polices voyagent avec le deck
  if ($SortiePptx) { $pres.SaveAs($SortiePptx, 24, -1); $rapport.pptx = $true }
  # ppSaveAsPDF (32)
  if ($SortiePdf) { $pres.SaveAs($SortiePdf, 32); $rapport.pdf = $true }
  $rapport.etat = 'exporte'
} catch {
  $rapport.etat = 'echec'
  $rapport.motif = "export par PowerPoint en echec : $($_.Exception.Message)"
  $code = 1
} finally {
  if ($null -ne $pres) {
    try { $pres.Close() } catch { }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) } catch { }
    $pres = $null
  }
  try {
    $rapport.autres_presentations = [int]$app.Presentations.Count
    $rapport.visible = ([int]$app.Visible -ne 0)
  } catch {
    $rapport.erreur_lecture = $true
  }
  $d = Get-Decision ([pscustomobject]$rapport)
  $rapport.lancee_par_l_export = $d.lancee_par_l_export
  $rapport.decision = $d.motif
  if ($d.quitter) {
    try { $app.Quit(); $rapport.quittee = $true } catch { $rapport.decision = "$($d.motif) ; Quit en echec : $($_.Exception.Message)" }
  }
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch { }
  $app = $null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
Write-Rapport $rapport $code
