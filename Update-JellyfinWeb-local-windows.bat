@echo off
setlocal

rem Packages a local dist folder and installs it into the default Windows Jellyfin Web path.
rem Optional source and target override:
rem Update-JellyfinWeb-local-windows.bat "D:\Path\To\dist" "D:\Path\To\jellyfin-web"

set "JELLYFIN_WEB_UPDATE_SCRIPT=%~f0"
set "JELLYFIN_WEB_DIST=%~1"
set "JELLYFIN_WEB_TARGET=%~2"
set "JELLYFIN_WEB_AUTO_CONFIRM=false"
if /i "%~2"=="--yes" set "JELLYFIN_WEB_TARGET="
if /i "%~2"=="--yes" set "JELLYFIN_WEB_AUTO_CONFIRM=true"
if /i "%~3"=="--yes" set "JELLYFIN_WEB_AUTO_CONFIRM=true"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$marker = '#' + ' POWERSHELL_PAYLOAD'; $source = Get-Content -LiteralPath $env:JELLYFIN_WEB_UPDATE_SCRIPT -Raw; $index = $source.LastIndexOf($marker); if ($index -lt 0) { throw 'PowerShell payload was not found.' }; $payload = $source.Substring($index + $marker.Length); & ([ScriptBlock]::Create($payload))"

set "UPDATE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%UPDATE_EXIT_CODE%"=="0" (echo Local Web installed successfully.) else (echo Installation failed. Existing Web files were preserved or restored.)
if /i not "%JELLYFIN_WEB_AUTO_CONFIRM%"=="true" pause
exit /b %UPDATE_EXIT_CODE%

# POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $env:JELLYFIN_WEB_UPDATE_SCRIPT

$distPath = $env:JELLYFIN_WEB_DIST
if ([string]::IsNullOrWhiteSpace($distPath)) {
    $distPath = @((Join-Path $scriptDirectory 'dist'), (Join-Path (Get-Location) 'dist')) |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($distPath) -and $env:JELLYFIN_WEB_AUTO_CONFIRM -ne 'true') { $distPath = Read-Host 'Local dist folder path' }
if ([string]::IsNullOrWhiteSpace($distPath)) { throw 'A local dist folder path is required.' }
$distPath = [IO.Path]::GetFullPath($distPath)
if (-not (Test-Path -LiteralPath (Join-Path $distPath 'index.html') -PathType Leaf)) { throw "dist\index.html was not found: $distPath" }

$targetPath = $env:JELLYFIN_WEB_TARGET
if ([string]::IsNullOrWhiteSpace($targetPath)) {
    $targetCandidates = @(
        (Join-Path $env:ProgramFiles 'Jellyfin\Server\jellyfin-web'),
        (Join-Path $env:ProgramData 'Jellyfin\Server\jellyfin-web')
    )
    $targetPath = $targetCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
    if (-not $targetPath) { $targetPath = $targetCandidates[0] }
}
$targetPath = [IO.Path]::GetFullPath($targetPath)
$targetParent = Split-Path -Parent $targetPath
if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) { throw "The target parent directory does not exist: $targetParent" }

Write-Host "Source : $distPath"
Write-Host "Target : $targetPath"
Write-Host 'Stop Jellyfin before replacement so the Web files are not locked.' -ForegroundColor Yellow
if ($env:JELLYFIN_WEB_AUTO_CONFIRM -ne 'true') {
    $answer = Read-Host 'Package and install this local dist? [y/N]'
    if ($answer -notin @('y', 'Y', 'yes', 'YES')) { Write-Host 'Cancelled.'; exit 3 }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$operationId = [Guid]::NewGuid().ToString('N')
$zipPath = Join-Path $targetParent ".jellyfin-web-local-$operationId.zip"
$stagingDirectory = Join-Path $targetParent ".jellyfin-web-update-$operationId"
$backupPath = "$targetPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$oldFolderMoved = $false
try {
    Write-Host "Compressing dist to: $zipPath"
    [IO.Compression.ZipFile]::CreateFromDirectory($distPath, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true)
    $null = New-Item -ItemType Directory -Path $stagingDirectory
    [IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $stagingDirectory)
    $newWebPath = Join-Path $stagingDirectory (Split-Path -Leaf $distPath)
    if (-not (Test-Path -LiteralPath (Join-Path $newWebPath 'index.html') -PathType Leaf)) { throw 'The local archive does not contain index.html.' }
    if (Test-Path -LiteralPath $targetPath -PathType Container) {
        if (Test-Path -LiteralPath $backupPath) { $backupPath = "$backupPath-$operationId" }
        Move-Item -LiteralPath $targetPath -Destination $backupPath
        $oldFolderMoved = $true
    }
    try { Move-Item -LiteralPath $newWebPath -Destination $targetPath } catch {
        if ($oldFolderMoved -and -not (Test-Path -LiteralPath $targetPath) -and (Test-Path -LiteralPath $backupPath)) { Move-Item -LiteralPath $backupPath -Destination $targetPath; $oldFolderMoved = $false }
        throw
    }
    Write-Host 'Local dist installed.' -ForegroundColor Green
    if ($oldFolderMoved) { Write-Host "Backup retained at: $backupPath" }
} finally {
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force }
}
