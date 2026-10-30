param([string]$Liste, [string]$Sortie, [string]$Langue = 'fr-FR')
# ocr-windows.ps1 — moteur OCR livré avec Windows (Windows.Media.Ocr), sans installation ni réseau.
# Entrée : un JSON, liste de chemins d'images. Sortie : un JSON UTF-8 [{chemin, texte, ms, lignes}].
# Exit : 0 fait · 3 moteur ou langue indisponible sur ce poste.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$gen = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Attendre($op, [Type]$t) { $x = $gen.MakeGenericMethod($t).Invoke($null, @($op)); $null = $x.Wait(-1); $x.Result }
$moteur = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Langue))
if ($null -eq $moteur) {
  $dispo = ([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag }) -join ','
  [Console]::Error.WriteLine("langue $Langue indisponible ; installées : $dispo")
  exit 3
}
$res = @()
foreach ($p in (Get-Content -Raw -Encoding UTF8 $Liste | ConvertFrom-Json)) {
  $w = [Diagnostics.Stopwatch]::StartNew()
  $f = Attendre ([Windows.Storage.StorageFile]::GetFileFromPathAsync(($p -replace '/', '\'))) ([Windows.Storage.StorageFile])
  $s = Attendre ($f.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $d = Attendre ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $b = Attendre ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $r = Attendre ($moteur.RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
  $lignes = @($r.Lines | ForEach-Object { $_.Text })
  $res += [pscustomobject]@{ chemin = $p; texte = ($lignes -join "`n"); ms = $w.ElapsedMilliseconds; lignes = $lignes.Count }
  $s.Dispose()
}
[IO.File]::WriteAllText($Sortie, (ConvertTo-Json -InputObject @($res) -Depth 3), [Text.UTF8Encoding]::new($false))
