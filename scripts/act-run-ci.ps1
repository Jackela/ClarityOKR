<#
.SYNOPSIS
    Runs the CI workflow using act (local GitHub Actions simulation).

.DESCRIPTION
    This script executes the CI workflow locally using nektos/act with flexible job selection,
    enabling developers to run specific parts of the CI pipeline for faster iteration.

.PARAMETER Job
    Specifies which job(s) to run:
    - build-and-test: Lint, typecheck, build, unit, component, and integration tests (default)
    - e2e: E2E tests (requires build-and-test to pass first)
    - all: Run all jobs sequentially

.PARAMETER SkipE2E
    Skips E2E tests when running workflow_dispatch (faster iteration).

.PARAMETER SkipLint
    Sets ALLOW_LINT=false to skip linting (faster iteration, not recommended for final validation).

.PARAMETER Pull
    Pulls the latest Ubuntu 24.04 runner image before executing the workflow.

.PARAMETER Verbose
    Enables verbose output showing detailed execution information.

.PARAMETER DryRun
    Shows the act command that would be executed without actually running it.

.PARAMETER SkipValidation
    Skips Docker image existence check (useful if image is known to exist).

.EXAMPLE
    pwsh scripts/act-run-ci.ps1
    Runs the build-and-test job with default settings.

.EXAMPLE
    pwsh scripts/act-run-ci.ps1 -Job e2e
    Runs the E2E job.

.EXAMPLE
    pwsh scripts/act-run-ci.ps1 -Job all
    Runs all jobs (build-and-test + e2e).

.EXAMPLE
    pwsh scripts/act-run-ci.ps1 -SkipE2E
    Runs build-and-test only, skipping E2E (via workflow_dispatch).

.EXAMPLE
    pwsh scripts/act-run-ci.ps1 -SkipLint
    Runs build-and-test without linting for faster iteration.

.EXAMPLE
    pwsh scripts/act-run-ci.ps1 -DryRun -Verbose
    Shows the full act command without executing it.

.LINK
    docs/ci-simulation.md
#>

Param(
  [Parameter(Position = 0)]
  [ValidateSet("build-and-test", "e2e", "all")]
  [string]$Job = "build-and-test",

  [switch]$SkipE2E,
  [switch]$SkipLint,
  [switch]$Pull,
  [switch]$Verbose,
  [switch]$DryRun,
  [switch]$SkipValidation
)

# Configuration
$ImageName = "ghcr.io/catthehacker/ubuntu:act-24.04"
$Platform = "-P ubuntu-latest=$ImageName"
$WorkflowFile = ".github/workflows/ci.yml"

# Function to test if Docker image exists locally
function Test-DockerImage {
  param([string]$Image)

  if ($Verbose) {
    Write-Host "[VERBOSE] Checking if Docker image exists: $Image" -ForegroundColor Cyan
  }

  $imageExists = docker images --format "{{.Repository}}:{{.Tag}}" | Select-String -Pattern ([regex]::Escape($Image)) -Quiet

  if ($Verbose) {
    Write-Host "[VERBOSE] Image exists: $imageExists" -ForegroundColor Cyan
  }

  return $imageExists
}

# Function to pull Docker image
function Get-DockerImage {
  param([string]$Image)

  Write-Host "Pulling Docker image: $Image" -ForegroundColor Yellow
  Write-Host "This may take several minutes (~1.5GB download)..." -ForegroundColor Yellow

  docker pull $Image | Out-Host

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to pull Docker image. Check your internet connection and Docker daemon."
    exit 1
  }

  Write-Host "Successfully pulled image: $Image" -ForegroundColor Green
}

# Pull image if requested
if ($Pull) {
  Get-DockerImage -Image $ImageName
}

# Validate Docker image exists (unless skipped)
if (-not $SkipValidation) {
  if (-not (Test-DockerImage -Image $ImageName)) {
    Write-Host ""
    Write-Host "Docker image not found: $ImageName" -ForegroundColor Yellow
    Write-Host ""

    $response = Read-Host "Pull the image now? This will download ~1.5GB (Y/n)"

    if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
      Get-DockerImage -Image $ImageName
    } else {
      Write-Host ""
      Write-Error "Cannot proceed without Docker image. Run with -Pull flag to download automatically."
      exit 1
    }
  } elseif ($Verbose) {
    Write-Host "[VERBOSE] Docker image found: $ImageName" -ForegroundColor Green
  }
}

# Build base act command
$actCommand = @("act")

# Determine event type and job selection based on parameters
if ($SkipE2E) {
  # Use workflow_dispatch with skip_e2e=true to skip E2E
  $actCommand += @(
    "workflow_dispatch"
    "-W"
    $WorkflowFile
    "--input"
    "skip_e2e=true"
    "-j"
    "build-and-test"
  )
} elseif ($Job -eq "e2e") {
  # Run E2E job specifically (will run build-and-test first due to needs)
  $actCommand += @(
    "push"
    "-W"
    $WorkflowFile
    "-j"
    "e2e"
  )
} elseif ($Job -eq "all") {
  # Run all jobs with push event
  $actCommand += @(
    "push"
    "-W"
    $WorkflowFile
  )
} else {
  # Standard push event for build-and-test only
  $actCommand += @(
    "push"
    "-W"
    $WorkflowFile
    "-j"
    "build-and-test"
  )
}

# Add platform flag
$actCommand += $Platform

# Add environment variables
if ($SkipLint) {
  $actCommand += @("--env", "ALLOW_LINT=false")
  if ($Verbose) {
    Write-Host "[VERBOSE] Lint will be skipped (ALLOW_LINT=false)" -ForegroundColor Cyan
  }
}

# Log command details if verbose
if ($Verbose) {
  Write-Host ""
  Write-Host "[VERBOSE] === Act Command Details ===" -ForegroundColor Cyan
  Write-Host "[VERBOSE] Job Selection: $Job" -ForegroundColor Cyan
  Write-Host "[VERBOSE] Workflow File: $WorkflowFile" -ForegroundColor Cyan
  Write-Host "[VERBOSE] Platform: $Platform" -ForegroundColor Cyan

  if ($SkipE2E) {
    Write-Host "[VERBOSE] Event: workflow_dispatch (skip_e2e=true)" -ForegroundColor Cyan
  } else {
    Write-Host "[VERBOSE] Event: push" -ForegroundColor Cyan
  }

  if ($SkipLint) {
    Write-Host "[VERBOSE] Environment: ALLOW_LINT=false" -ForegroundColor Cyan
  }

  Write-Host "[VERBOSE] Full Command: $($actCommand -join ' ')" -ForegroundColor Cyan
  Write-Host "[VERBOSE] ===========================" -ForegroundColor Cyan
  Write-Host ""
}

# Dry-run mode: show command and exit
if ($DryRun) {
  Write-Host ""
  Write-Host "Dry-run mode: Command that would be executed:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  $($actCommand -join ' ')" -ForegroundColor White
  Write-Host ""

  if (-not $Verbose) {
    Write-Host "Tip: Use -Verbose flag to see additional execution details" -ForegroundColor Gray
  }

  exit 0
}

# Execute act command
Write-Host ""
Write-Host "Running CI workflow (Job: $Job)..." -ForegroundColor Green

if ($Job -eq "all") {
  Write-Host "This will run all jobs sequentially (may take 20+ minutes)." -ForegroundColor Gray
} elseif ($Job -eq "e2e") {
  Write-Host "This will run E2E tests (15-20 minutes)." -ForegroundColor Gray
} else {
  Write-Host "This will run lint, typecheck, build, and tests (5-10 minutes)." -ForegroundColor Gray
}

Write-Host ""

& $actCommand[0] $actCommand[1..($actCommand.Length - 1)]

# Capture and propagate exit code
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
  Write-Host ""
  Write-Host "Workflow completed successfully!" -ForegroundColor Green
  Write-Host ""
} else {
  Write-Host ""
  Write-Error "Workflow failed with exit code: $exitCode"
  Write-Host "Review the output above for error details." -ForegroundColor Yellow
  Write-Host "See docs/ci-simulation.md for troubleshooting guidance." -ForegroundColor Yellow
  Write-Host ""
}

exit $exitCode
