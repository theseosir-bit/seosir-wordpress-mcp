# Run in a SECOND PowerShell window with the local MCP server running.
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3000'
function Check-Status([string]$url,[string]$method='GET',[string]$body='') {
  try {
    $args = @{ Uri = $url; Method = $method; UseBasicParsing = $true; TimeoutSec = 10 }
    if ($body) {
      $args['Body'] = $body
      $args['ContentType'] = 'application/json'
    }
    $r = Invoke-WebRequest @args
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    throw "Cannot reach $url : $($_.Exception.Message)"
  }
}
$health = Check-Status "$base/healthz"
$unauth = Check-Status "$base/mcp" 'POST' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$metadata = Check-Status "$base/.well-known/oauth-protected-resource"
Write-Host "Health HTTP: $health (expected 200)"
Write-Host "Unauthenticated MCP HTTP: $unauth (expected 401)"
Write-Host "OAuth resource metadata HTTP: $metadata (expected 200)"
if ($health -ne 200 -or $unauth -ne 401 -or $metadata -ne 200) { exit 1 }
Write-Host 'OK: Local MCP is healthy and rejects unauthenticated access.'
