@echo off
setlocal

rem Packages a local dist folder and installs it into .\JellyfinWeb beside this BAT.
rem Optional source: Update-JellyfinWeb-local-linux.bat "D:\Path\To\dist"

set "JELLYFIN_WEB_UPDATE_SCRIPT=%~f0"
set "JELLYFIN_WEB_TARGET=%~dp0JellyfinWeb"
set "JELLYFIN_WEB_DIST=%~1"
set "JELLYFIN_WEB_AUTO_CONFIRM=false"
set "JELLYFIN_WEB_JAVASCRIPT_URL=%~3"
if /i "%~2"=="--yes" set "JELLYFIN_WEB_AUTO_CONFIRM=true"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$marker = '#' + ' POWERSHELL_PAYLOAD'; $source = Get-Content -LiteralPath $env:JELLYFIN_WEB_UPDATE_SCRIPT -Raw; $index = $source.LastIndexOf($marker); if ($index -lt 0) { throw 'PowerShell payload was not found.' }; $payload = $source.Substring($index + $marker.Length); & ([ScriptBlock]::Create($payload))"

set "UPDATE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%UPDATE_EXIT_CODE%"=="0" (echo Finished successfully.) else (echo Failed. Existing Web files were preserved or restored.)
if /i not "%JELLYFIN_WEB_AUTO_CONFIRM%"=="true" pause
exit /b %UPDATE_EXIT_CODE%

# POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $env:JELLYFIN_WEB_UPDATE_SCRIPT
$targetPath = [IO.Path]::GetFullPath($env:JELLYFIN_WEB_TARGET)
$targetParent = Split-Path -Parent $targetPath

function Install-LocalWeb {
$distPath = $env:JELLYFIN_WEB_DIST
if ([string]::IsNullOrWhiteSpace($distPath)) {
    $distPath = @((Join-Path $scriptDirectory 'dist'), (Join-Path (Get-Location) 'dist')) |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($distPath) -and $env:JELLYFIN_WEB_AUTO_CONFIRM -ne 'true') { $distPath = Read-Host 'Local dist folder path' }
if ([string]::IsNullOrWhiteSpace($distPath)) { throw 'A local dist folder path is required.' }
$distPath = [IO.Path]::GetFullPath($distPath)
if (-not (Test-Path -LiteralPath (Join-Path $distPath 'index.html') -PathType Leaf)) { throw "dist\index.html was not found: $distPath" }

Write-Host "Source : $distPath"
Write-Host "Target : $targetPath"
Write-Host 'Stop Jellyfin before replacement so the Web files are not locked.' -ForegroundColor Yellow

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
}

Write-Host "Jellyfin Web folder: $targetPath"
if ($env:JELLYFIN_WEB_AUTO_CONFIRM -eq 'true') { $installLocalWeb = $true } else {
    $answer = Read-Host 'Package and install the local dist? [y/N]'
    $installLocalWeb = $answer -in @('y', 'Y', 'yes', 'YES')
}
if ($installLocalWeb) { Install-LocalWeb } else { Write-Host 'Local dist installation skipped.' }

if ($env:JELLYFIN_WEB_AUTO_CONFIRM -eq 'true') { $insertJavaScript = $true } else {
    $answer = Read-Host 'Insert an external JavaScript tag into index.html? [y/N]'
    $insertJavaScript = $answer -in @('y', 'Y', 'yes', 'YES')
}
if ($insertJavaScript) {
    $indexPath = Join-Path $targetPath 'index.html'
    $urlFile = Join-Path $scriptDirectory 'JellyfinWeb-javascript-url.txt'
    $savedUrl = if (Test-Path -LiteralPath $urlFile -PathType Leaf) { (Get-Content -LiteralPath $urlFile -First 1).Trim() } else { '' }
    $javascriptUrl = $env:JELLYFIN_WEB_JAVASCRIPT_URL
    if ([string]::IsNullOrWhiteSpace($javascriptUrl) -and $env:JELLYFIN_WEB_AUTO_CONFIRM -ne 'true') {
        $prompt = if ($savedUrl) { "JavaScript URL [$savedUrl]" } else { 'JavaScript URL' }
        $enteredUrl = Read-Host $prompt
        $javascriptUrl = if ([string]::IsNullOrWhiteSpace($enteredUrl)) { $savedUrl } else { $enteredUrl.Trim() }
    }
    $uri = $null
    if ([string]::IsNullOrWhiteSpace($javascriptUrl) -or -not [Uri]::TryCreate($javascriptUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http', 'https')) { throw 'A valid HTTP or HTTPS JavaScript URL is required.' }
    $source = [IO.File]::ReadAllText($indexPath)
    $escapedUrl = [Net.WebUtility]::HtmlEncode($javascriptUrl)
    $pattern = '<script\b[^>]*\bsrc\s*=\s*(["'']?)' + [regex]::Escape($escapedUrl) + '\1[^>]*>\s*</script>'
    if (-not [regex]::IsMatch($source, $pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        $closingBody = [regex]::Match($source, '</body\s*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (-not $closingBody.Success) { throw 'index.html does not contain a closing body tag.' }
        $indexBackup = "$indexPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item -LiteralPath $indexPath -Destination $indexBackup
        $tag = '<script src="' + $escapedUrl + '"></script>'
        [IO.File]::WriteAllText($indexPath, $source.Insert($closingBody.Index, "    $tag`r`n"), [Text.UTF8Encoding]::new($false))
        Write-Host "JavaScript tag inserted. Backup retained at: $indexBackup" -ForegroundColor Green
    } else { Write-Host 'The JavaScript tag is already present; no change was made.' }
    Set-Content -LiteralPath $urlFile -Value $javascriptUrl -Encoding UTF8
} else { Write-Host 'JavaScript insertion skipped.' }
