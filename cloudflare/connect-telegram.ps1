param(
    [Parameter(Mandatory = $true)]
    [string]$WorkerUrl
)

$token = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ".telegram-token")).Trim()
$webhookSecret = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ".webhook-secret")).Trim()

if ($token.StartsWith("PASTE_") -or $webhookSecret.StartsWith("PASTE_")) {
    throw "Replace both local secret placeholders first."
}

$workerBaseUrl = $WorkerUrl.TrimEnd("/")
$response = Invoke-RestMethod -Method Post `
    -Uri "https://api.telegram.org/bot$token/setWebhook" `
    -Body @{ url = "$workerBaseUrl/webhook"; secret_token = $webhookSecret; allowed_updates = '["message","callback_query","poll_answer","poll"]' }

if (-not $response.ok) {
    throw "Telegram did not accept the webhook."
}

Write-Output "Telegram webhook connected successfully."
