# Prepares a Windows environment so pnpm can compile native addons from source.
#
# Why: pnpm 9 bundles node-gyp 10.3.1, which does not recognize Visual Studio
# 2026 (internal version 18) on GitHub's windows-latest image. The failure
# looks like: find VS unknown version "undefined" found at
# "C:\Program Files\Microsoft Visual Studio\18\Enterprise". node-gyp 12.1.0+
# understands v18. pnpm only uses its bundled copy when npm_config_node_gyp is
# unset, so this script installs node-gyp 12.x and exports that variable.
#
# Used by .github/workflows/ci.yml and release.yml. Safe to run locally in
# PowerShell (GITHUB_ENV / GITHUB_PATH are skipped when absent).
#
# Do not set msvs_version / GYP_MSVS_VERSION to 2022: the current
# windows-latest image does not ship Visual Studio 2022.

$ErrorActionPreference = 'Stop'

function Write-CiError([string]$Message) {
  Write-Host "::error::$Message"
  exit 1
}

$minimumVersion = [version]'12.1.0'

Write-Host "Installing node-gyp@12 (minimum supported: $minimumVersion)..."
npm install -g node-gyp@12
if ($LASTEXITCODE -ne 0) {
  Write-CiError "npm install -g node-gyp@12 failed with exit code $LASTEXITCODE"
}

$globalRoot = (npm root -g).Trim()
$nodeGypJs = Join-Path $globalRoot 'node-gyp\bin\node-gyp.js'
if (-not (Test-Path -LiteralPath $nodeGypJs)) {
  Write-CiError "node-gyp.js not found at $nodeGypJs"
}

$rawVersion = (& node $nodeGypJs --version).Trim()
$parsedVersion = [version]($rawVersion -replace '^v', '')
if ($parsedVersion -lt $minimumVersion) {
  Write-CiError "node-gyp $rawVersion is older than $minimumVersion (needed to detect Visual Studio 2026 / v18)"
}
Write-Host "Using node-gyp $rawVersion at $nodeGypJs"

function Add-RunnerEnv([string]$Name, [string]$Value) {
  Set-Item -Path "Env:$Name" -Value $Value
  if ($env:GITHUB_ENV) {
    "$Name=$Value" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  }
}

# Official pnpm override for the bundled node-gyp. Do not force msvs_version=2022.
Add-RunnerEnv 'npm_config_node_gyp' $nodeGypJs

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
  Add-RunnerEnv 'NODE_GYP_FORCE_PYTHON' $pythonCmd.Source
  Add-RunnerEnv 'npm_config_python' $pythonCmd.Source
  Write-Host "Python: $($pythonCmd.Source)"
}

$npmPrefix = (npm prefix -g).Trim()
if ($npmPrefix) {
  $env:Path = "$npmPrefix;$env:Path"
  if ($env:GITHUB_PATH) {
    $npmPrefix | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
  }
}

$vsPath = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
  $found = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  if ($found) {
    $vsPath = ($found | Select-Object -First 1).Trim()
  }
}

if (-not $vsPath) {
  $years = @('18', '2026', '2022', '17')
  $editions = @('Enterprise', 'Professional', 'Community', 'BuildTools', 'Insiders')
  $roots = @(${env:ProgramFiles}, ${env:ProgramFiles(x86)})
  foreach ($root in $roots) {
    if (-not $root) { continue }
    foreach ($year in $years) {
      foreach ($edition in $editions) {
        $candidate = Join-Path $root "Microsoft Visual Studio\$year\$edition"
        if (Test-Path -LiteralPath $candidate) {
          $vsPath = $candidate
          break
        }
      }
      if ($vsPath) { break }
    }
    if ($vsPath) { break }
  }
}

if (-not $vsPath) {
  Write-CiError "No Visual Studio 2022 or 2026 with C++ tools was found. Native modules cannot be compiled on this runner."
}

Write-Host "Visual Studio found at: $vsPath"
if ($vsPath -notmatch '\\(18|17|2026|2022)\\') {
  Write-Host "::warning::Visual Studio path is not a 2022/2026 layout: $vsPath"
}

Write-Host "Windows native-module toolchain is ready."
