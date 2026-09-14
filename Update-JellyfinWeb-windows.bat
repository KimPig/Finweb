@echo off
setlocal

rem Updates the default Windows Jellyfin Web installation.
rem Optional override: Update-JellyfinWeb-windows.bat "D:\Path\To\jellyfin-web"

set "JELLYFIN_WEB_UPDATE_SCRIPT=%~f0"
set "JELLYFIN_WEB_TARGET=%~1"

set "JELLYFIN_WEB_AUTO_CONFIRM=false"
if /i "%~2"=="--yes" set "JELLYFIN_WEB_AUTO_CONFIRM=true"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$marker = '#' + ' POWERSHELL_PAYLOAD'; $source = Get-Content -LiteralPath $env:JELLYFIN_WEB_UPDATE_SCRIPT -Raw; $index = $source.LastIndexOf($marker); if ($index -lt 0) { throw 'PowerShell payload was not found.' }; $payload = $source.Substring($index + $marker.Length); & ([ScriptBlock]::Create($payload))"

set "UPDATE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%UPDATE_EXIT_CODE%"=="0" (
  echo Update completed successfully.
) else if "%UPDATE_EXIT_CODE%"=="3" (
  echo Update cancelled.
) else (
  echo Update failed. The existing Web folder was preserved or restored.
)

if /i not "%JELLYFIN_WEB_AUTO_CONFIRM%"=="true" pause
exit /b %UPDATE_EXIT_CODE%

# POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$curlCommand = Get-Command curl.exe -ErrorAction SilentlyContinue

function Get-GitHubReleases([string]$Uri, [hashtable]$Headers) {
    if ($curlCommand) {
        $jsonLines = & $curlCommand.Source --fail --silent --show-error --location --retry 2 --connect-timeout 10 --max-time 30 `
            --header "Accept: $($Headers.Accept)" `
            --header "User-Agent: $($Headers['User-Agent'])" `
            --header "X-GitHub-Api-Version: $($Headers['X-GitHub-Api-Version'])" `
            $Uri
        if ($LASTEXITCODE -ne 0) { throw "curl.exe failed to query GitHub (exit code $LASTEXITCODE)." }
        return (($jsonLines -join "`n") | ConvertFrom-Json)
    }
    return Invoke-RestMethod -Headers $Headers -Uri $Uri -TimeoutSec 30
}

function Save-RemoteFile([string]$Uri, [string]$Destination, [int]$TimeoutSeconds) {
    if ($curlCommand) {
        & $curlCommand.Source --fail --silent --show-error --location --retry 2 --connect-timeout 10 --max-time $TimeoutSeconds `
            --header 'User-Agent: Jellyfin-Web-Patch-Updater' `
            --output $Destination `
            $Uri
        if ($LASTEXITCODE -ne 0) { throw "curl.exe failed to download an asset (exit code $LASTEXITCODE)." }
        return
    }
    Invoke-WebRequest -Headers @{ 'User-Agent' = 'Jellyfin-Web-Patch-Updater' } -Uri $Uri -OutFile $Destination -TimeoutSec $TimeoutSeconds
}
$repository = 'KimPig/jellyfin-web'
$requestedTarget = $env:JELLYFIN_WEB_TARGET
if ([string]::IsNullOrWhiteSpace($requestedTarget)) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Jellyfin\Server\jellyfin-web'),
        (Join-Path $env:ProgramData 'Jellyfin\Server\jellyfin-web')
    )
    $requestedTarget = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
    if (-not $requestedTarget) {
        $requestedTarget = $candidates[0]
    }
}
$targetPath = [IO.Path]::GetFullPath($requestedTarget)
$targetRoot = [IO.Path]::GetPathRoot($targetPath)
if ($targetPath.TrimEnd([IO.Path]::DirectorySeparatorChar) -eq $targetRoot.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
    throw 'A drive root cannot be used as the Jellyfin Web target.'
}

$targetParent = Split-Path -Parent $targetPath
if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
    throw "The target parent directory does not exist: $targetParent"
}
if ((Test-Path -LiteralPath $targetPath) -and -not (Test-Path -LiteralPath $targetPath -PathType Container)) {
    throw "The target exists but is not a directory: $targetPath"
}
$headers = @{
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'Jellyfin-Web-Patch-Updater'
    'X-GitHub-Api-Version' = '2022-11-28'
}
$releases = Get-GitHubReleases "https://api.github.com/repos/$repository/releases?per_page=30" $headers
$release = $releases |
    Where-Object { -not $_.draft -and $_.tag_name -match '^v.+[.]patch[.]\d{8}[.]\d+$' } |
    Sort-Object { [DateTimeOffset]$_.published_at } -Descending |
    Select-Object -First 1
if (-not $release) {
    throw 'No patch release was found.'
}

$zipAsset = $release.assets |
    Where-Object { $_.name -eq "jellyfin-web-$($release.tag_name)-dist.zip" } |
    Select-Object -First 1
$hashAsset = $release.assets |
    Where-Object { $_.name -eq "$($zipAsset.name).sha256" } |
    Select-Object -First 1
if (-not $zipAsset -or -not $hashAsset) {
    throw "The release assets are incomplete for $($release.tag_name)."
}

Write-Host "Release : $($release.tag_name)"
Write-Host "Target  : $targetPath"
if ($env:JELLYFIN_WEB_AUTO_CONFIRM -ne 'true') {
    Write-Host ''
    Write-Host 'Stop Jellyfin before continuing so its Web files are not locked.' -ForegroundColor Yellow
    $answer = Read-Host 'Download and replace this Web folder? [y/N]'
    if ($answer -notin @('y', 'Y', 'yes', 'YES')) {
        Write-Host 'Cancelled.'
        exit 3
    }
}

$operationId = [Guid]::NewGuid().ToString('N')
$downloadDirectory = Join-Path ([IO.Path]::GetTempPath()) "jellyfin-web-download-$operationId"
$stagingDirectory = Join-Path $targetParent ".jellyfin-web-update-$operationId"
$zipPath = Join-Path $downloadDirectory $zipAsset.name
$hashPath = Join-Path $downloadDirectory $hashAsset.name
$backupPath = "$targetPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$oldFolderMoved = $false

try {
    $null = New-Item -ItemType Directory -Path $downloadDirectory
    $null = New-Item -ItemType Directory -Path $stagingDirectory

    Write-Host 'Downloading release assets...'
    Save-RemoteFile $zipAsset.browser_download_url $zipPath 300
    Save-RemoteFile $hashAsset.browser_download_url $hashPath 30

    $hashText = Get-Content -LiteralPath $hashPath -Raw
    $hashMatch = [regex]::Match($hashText, '(?i)\b[0-9a-f]{64}\b')
    if (-not $hashMatch.Success) {
        throw 'The SHA-256 file is invalid.'
    }
    $expectedHash = $hashMatch.Value.ToUpperInvariant()
    $sha256 = [Security.Cryptography.SHA256]::Create()
    $zipStream = [IO.File]::OpenRead($zipPath)
    try {
        $actualHash = ($sha256.ComputeHash($zipStream) | ForEach-Object { $_.ToString('X2') }) -join ''
    } finally {
        $zipStream.Dispose()
        $sha256.Dispose()
    }
    if ($actualHash -ne $expectedHash) {
        throw "SHA-256 mismatch. Expected $expectedHash but downloaded $actualHash."
    }

    Write-Host 'Extracting verified Web files...'
    Expand-Archive -LiteralPath $zipPath -DestinationPath $stagingDirectory
    $newWebPath = Join-Path $stagingDirectory 'dist'
    if (-not (Test-Path -LiteralPath (Join-Path $newWebPath 'index.html') -PathType Leaf)) {
        throw 'The release ZIP does not contain dist\index.html.'
    }

    if (Test-Path -LiteralPath $targetPath -PathType Container) {
        if (Test-Path -LiteralPath $backupPath) {
            $backupPath = "$backupPath-$operationId"
        }
        Write-Host "Backing up the existing folder to: $backupPath"
        Move-Item -LiteralPath $targetPath -Destination $backupPath
        $oldFolderMoved = $true
    }

    try {
        Move-Item -LiteralPath $newWebPath -Destination $targetPath
    } catch {
        if ($oldFolderMoved -and -not (Test-Path -LiteralPath $targetPath) -and (Test-Path -LiteralPath $backupPath)) {
            Move-Item -LiteralPath $backupPath -Destination $targetPath
            $oldFolderMoved = $false
        }
        throw
    }

    Write-Host "Installed $($release.tag_name)." -ForegroundColor Green
    if ($oldFolderMoved) {
        Write-Host "Backup retained at: $backupPath"
    }
} finally {
    if (Test-Path -LiteralPath $downloadDirectory) {
        Remove-Item -LiteralPath $downloadDirectory -Recurse -Force
    }
    if (Test-Path -LiteralPath $stagingDirectory) {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
    }
}
