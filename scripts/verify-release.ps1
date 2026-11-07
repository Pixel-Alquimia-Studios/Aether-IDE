# verify-release.ps1 — Verificación final del empaquetado de Aether IDE (Fase 5)
# Comprueba que el ejecutable nativo y los instaladores existan en src-tauri/target/release/bundle/
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'src-tauri\target\release'
$bundle = Join-Path $release 'bundle'

$failed = $false

function Check-Artifact {
    param([string]$Path, [string]$Label)
    if (Test-Path -LiteralPath $Path) {
        $size = (Get-Item -LiteralPath $Path).Length / 1MB
        Write-Host ("  OK  {0}: {1}  ({2:N2} MiB)" -f $Label, (Split-Path -Leaf $Path), $size)
        return $true
    }
    Write-Host ("  FALTA  {0}: {1}" -f $Label, (Split-Path -Leaf $Path))
    return $false
}

Write-Output '=== Verificación de artefactos de Aether IDE ==='

Write-Output '[1] Ejecutable nativo (release):'
$failed = -not (Check-Artifact (Join-Path $release 'aether-ide.exe') 'aether-ide.exe') -or $failed

Write-Output '[2] Instalador NSIS:'
$nsis = Get-ChildItem -LiteralPath (Join-Path $bundle 'nsis') -Filter '*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($nsis) {
    $failed = -not (Check-Artifact $nsis.FullName 'Instalador NSIS (.exe)') -or $failed
} else {
    Write-Output '  FALTA  Instalador NSIS'
    $failed = $true
}

Write-Output '[3] Instalador MSI:'
$msi = Get-ChildItem -LiteralPath (Join-Path $bundle 'msi') -Filter '*.msi' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($msi) {
    $failed = -not (Check-Artifact $msi.FullName 'Instalador MSI (.msi)') -or $failed
} else {
    Write-Output '  FALTA  Instalador MSI'
    $failed = $true
}

Write-Output '[4] CSP compatible con Monaco/xterm (Lote H):'
Write-Output '    (solo valida la CONFIGURACIÓN de tauri.conf.json, no el resultado compilado)'
node (Join-Path $PSScriptRoot 'verify-csp.mjs')
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Output ''
if ($failed) {
    Write-Output '== FALLO: hay problemas. Corrígelos y vuelve a lanzar. =='
    exit 1
}
Write-Output '== OK: empaquetado de producción completo. =='
Write-Output ''
Write-Output '=== CHECKLIST MANUAL DEL RELEASE (build instalado) ==='
Write-Output '  (a) Abrir un archivo de código: colores de sintaxis del tema Aether y'
Write-Output '      números de línea GRIS alineados a la DERECHA (CSP de estilos OK).'
Write-Output '  (b) Abrir la terminal (Ctrl+J): colores correctos y cursor visible'
Write-Output '      (xterm inyecta CSS en runtime).'
Write-Output '  (c) Abrir Ajustes y el chat: estilos correctos (Tailwind va en el bundle,'
Write-Output '      pero valida el tema y los paneles).'
Write-Output '  (d) Instalar NSIS y MSI: pantallas legibles — texto negro del asistente'
Write-Output '      sobre blanco; arte de marca solo en la columna izquierda (MSI) y'
Write-Output '      símbolo pequeño a la derecha del banner (MSI).'
exit 0
