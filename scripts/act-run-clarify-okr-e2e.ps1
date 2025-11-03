Param(
  [switch]$Pull
)

# Ensure we use 24.04 image and non-root user (also set in .actrc)
$platform = "-P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-24.04"
$opts = "--container-options --user 1001:1001"

if ($Pull) {
  docker pull ghcr.io/catthehacker/ubuntu:act-24.04 | Out-Host
}

# Trigger Clarify OKR workflow_dispatch and run E2E
act workflow_dispatch `
  -W .github/workflows/clarify-okr.yml `
  -j build-and-test `
  -i skip_sys_deps=true `
  -i skip_e2e=false `
  $platform `
  $opts

