# word-vers-pdf.ps1 - exporte un .docx en PDF par Word en automation, pour l'apercu de make-it-better.
# Document ouvert en lecture seule, ferme sans enregistrer, Quit seulement si cette instance n'a plus
# de document. Le numero du processus part sur la sortie des sa creation : serveur-versions.mjs le note
# pour arreter ce seul WINWORD.EXE /Automation si l'export depasse 120 secondes. Un Word ouvert par le
# porteur n'est jamais touche : New-Object cree sa propre instance, et rien ici ne cible un autre numero.
#
# MIB_SIM_WORD (recette seulement) : absent = Word manque ; gel = l'instance ne repond plus.
# Exit : 0 fait - 3 Word absent - 1 echec de l'export. Fichier en ASCII : PowerShell 5.1 sans BOM.
param([Parameter(Mandatory = $true)][string]$Entree, [Parameter(Mandatory = $true)][string]$Sortie)
$ErrorActionPreference = 'Stop'

if ($env:MIB_SIM_WORD -eq 'absent') { Write-Output 'ABSENT'; exit 3 }

function Lister-Automation {
  @(Get-CimInstance Win32_Process -Filter "Name='WINWORD.EXE'" | Where-Object { $_.CommandLine -match '/Automation' } | ForEach-Object { [int]$_.ProcessId })
}

$avant = Lister-Automation
try {
  $word = New-Object -ComObject Word.Application
} catch {
  Write-Output 'ABSENT'
  exit 3
}
$numero = @(Lister-Automation | Where-Object { $avant -notcontains $_ })[0]
if ($numero) { Write-Output "PID=$numero" }
[Console]::Out.Flush()

$doc = $null
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  # Fichier, ConfirmConversions, ReadOnly, AddToRecentFiles
  $doc = $word.Documents.Open($Entree, $false, $true, $false)
  if ($env:MIB_SIM_WORD -eq 'gel') { while ($true) { Start-Sleep -Seconds 5 } }
  # 17 = wdExportFormatPDF
  $doc.ExportAsFixedFormat($Sortie, 17)
  Write-Output 'EXPORT=OK'
} catch {
  Write-Output "ERREUR=$($_.Exception.Message)"
  $script:echec = $true
} finally {
  # 0 = wdDoNotSaveChanges
  if ($doc) { try { $doc.Close(0) } catch { } }
  $reste = 0
  try { $reste = $word.Documents.Count } catch { $reste = 0 }
  if ($reste -eq 0) {
    # Quit sans argument : en PowerShell, Quit(0) leve une erreur de type et Word reste en memoire.
    # Plus aucun document ouvert ici : rien a enregistrer, et DisplayAlerts interdit toute question.
    try { $word.Quit(); Write-Output 'QUIT=OK' } catch { Write-Output "QUIT=ERREUR $($_.Exception.Message)" }
  } else {
    Write-Output "RESTE=$reste"
  }
  if ($doc) { try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) } catch { } }
  try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) } catch { }
  $doc = $null
  $word = $null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
if ($script:echec) { exit 1 }
exit 0
