$tokenFile = Join-Path $PSScriptRoot ".telegram-token"
$webhookFile = Join-Path $PSScriptRoot ".webhook-secret"

function Publish-SecretFromFile {
    param([string]$Name, [string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing $Path"
    }
    $Value = (Get-Content -Raw -LiteralPath $Path).Trim()
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.StartsWith("PASTE_")) {
        throw "Replace the placeholder in $Path before uploading secrets."
    }
    $Value | npx wrangler secret put $Name
}

Publish-SecretFromFile -Name "TELEGRAM_BOT_TOKEN" -Path $tokenFile
Publish-SecretFromFile -Name "WEBHOOK_SECRET" -Path $webhookFile
