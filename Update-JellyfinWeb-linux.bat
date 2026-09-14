@echo off
setlocal

rem Windows BAT for a Linux server Web folder mounted beside this file.
rem Target: .\JellyfinWeb

set "JELLYFIN_WEB_UPDATE_SCRIPT=%~f0"
set "JELLYFIN_WEB_TARGET=%~dp0JellyfinWeb"
set "JELLYFIN_WEB_AUTO_CONFIRM=false"
set "JELLYFIN_WEB_JAVASCRIPT_URL="
if /i "%~1"=="--yes" set "JELLYFIN_WEB_AUTO_CONFIRM=true"
if /i "%~1"=="--yes" set "JELLYFIN_WEB_JAVASCRIPT_URL=%~2"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$marker = '#' + ' POWERSHELL_PAYLOAD'; $source = Get-Content -LiteralPath $env:JELLYFIN_WEB_UPDATE_SCRIPT -Raw; $index = $source.LastIndexOf($marker); if ($index -lt 0) { throw 'PowerShell payload was not found.' }; $payload = $source.Substring($index + $marker.Length); & ([ScriptBlock]::Create($payload))"

set "UPDATE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%UPDATE_EXIT_CODE%"=="0" (
  echo Finished successfully.
) else (
  echo Failed. Existing Web files were preserved or restored.
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
$targetPath = [IO.Path]::GetFullPath($env:JELLYFIN_WEB_TARGET)
$scriptDirectory = Split-Path -Parent $env:JELLYFIN_WEB_UPDATE_SCRIPT
$targetParent = Split-Path -Parent $targetPath
if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
    throw "The target parent directory does not exist: $targetParent"
}
function Confirm-Choice([string]$Prompt) {
    if ($env:JELLYFIN_WEB_AUTO_CONFIRM -eq 'true') { return $true }
    $answer = Read-Host "$Prompt [y/N]"
    return $answer -in @('y', 'Y', 'yes', 'YES')
}

function Get-Sha256([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) -join ''
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Install-LatestWeb {
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

        $hashMatch = [regex]::Match((Get-Content -LiteralPath $hashPath -Raw), '(?i)\b[0-9a-f]{64}\b')
        if (-not $hashMatch.Success) { throw 'The SHA-256 file is invalid.' }
        $expectedHash = $hashMatch.Value.ToUpperInvariant()
        $actualHash = Get-Sha256 $zipPath
        if ($actualHash -ne $expectedHash) { throw "SHA-256 mismatch. Expected $expectedHash but downloaded $actualHash." }

        Write-Host 'Extracting verified Web files...'
        Expand-Archive -LiteralPath $zipPath -DestinationPath $stagingDirectory
        $newWebPath = Join-Path $stagingDirectory 'dist'
        if (-not (Test-Path -LiteralPath (Join-Path $newWebPath 'index.html') -PathType Leaf)) {
            throw 'The release ZIP does not contain dist\index.html.'
        }

        if (Test-Path -LiteralPath $targetPath -PathType Container) {
            if (Test-Path -LiteralPath $backupPath) { $backupPath = "$backupPath-$operationId" }
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
        if ($oldFolderMoved) { Write-Host "Backup retained at: $backupPath" }
    } finally {
        if (Test-Path -LiteralPath $downloadDirectory) { Remove-Item -LiteralPath $downloadDirectory -Recurse -Force }
        if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force }
    }
}

function Add-JavaScriptTag {
    $indexPath = Join-Path $targetPath 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) { throw "index.html was not found: $indexPath" }

    $urlFile = Join-Path $scriptDirectory 'JellyfinWeb-javascript-url.txt'
    $savedUrl = if (Test-Path -LiteralPath $urlFile -PathType Leaf) { (Get-Content -LiteralPath $urlFile -First 1).Trim() } else { '' }
    $javascriptUrl = $env:JELLYFIN_WEB_JAVASCRIPT_URL
    if ([string]::IsNullOrWhiteSpace($javascriptUrl) -and $env:JELLYFIN_WEB_AUTO_CONFIRM -ne 'true') {
        $prompt = if ($savedUrl) { "JavaScript URL [$savedUrl]" } else { 'JavaScript URL' }
        $enteredUrl = Read-Host $prompt
        $javascriptUrl = if ([string]::IsNullOrWhiteSpace($enteredUrl)) { $savedUrl } else { $enteredUrl.Trim() }
    }
    $uri = $null
    if ([string]::IsNullOrWhiteSpace($javascriptUrl) -or -not [Uri]::TryCreate($javascriptUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http', 'https')) {
        throw 'A valid HTTP or HTTPS JavaScript URL is required.'
    }

    $source = [IO.File]::ReadAllText($indexPath)
    $escapedUrl = [Net.WebUtility]::HtmlEncode($javascriptUrl)
    $pattern = '<script\b[^>]*\bsrc\s*=\s*(["'']?)' + [regex]::Escape($escapedUrl) + '\1[^>]*>\s*</script>'
    if ([regex]::IsMatch($source, $pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        Write-Host 'The JavaScript tag is already present; no change was made.'
        Set-Content -LiteralPath $urlFile -Value $javascriptUrl -Encoding UTF8
        return
    }

    $closingBody = [regex]::Match($source, '</body\s*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $closingBody.Success) { throw 'index.html does not contain a closing body tag.' }
    $backupPath = "$indexPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $indexPath -Destination $backupPath
    $tag = '<script src="' + $escapedUrl + '"></script>'
    $updated = $source.Insert($closingBody.Index, "    $tag`r`n")
    [IO.File]::WriteAllText($indexPath, $updated, [Text.UTF8Encoding]::new($false))
    Set-Content -LiteralPath $urlFile -Value $javascriptUrl -Encoding UTF8
    Write-Host "JavaScript tag inserted. Backup retained at: $backupPath" -ForegroundColor Green
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
if (-not $release) { throw 'No patch release was found.' }
$zipAsset = $release.assets | Where-Object { $_.name -eq "jellyfin-web-$($release.tag_name)-dist.zip" } | Select-Object -First 1
$hashAsset = $release.assets | Where-Object { $_.name -eq "$($zipAsset.name).sha256" } | Select-Object -First 1
if (-not $zipAsset -or -not $hashAsset) { throw "Release assets are incomplete for $($release.tag_name)." }

Write-Host "Release : $($release.tag_name)"
Write-Host "Target  : $targetPath"
Write-Host 'Stop Jellyfin before replacement so the Web files are not locked.' -ForegroundColor Yellow
if (Confirm-Choice 'Download and install the latest patch release?') { Install-LatestWeb } else { Write-Host 'Web download skipped.' }
if (Confirm-Choice 'Insert an external JavaScript tag into index.html?') { Add-JavaScriptTag } else { Write-Host 'JavaScript insertion skipped.' }
