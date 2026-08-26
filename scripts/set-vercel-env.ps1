# Vercel 환경 변수 등록 스크립트
#
# .env.local의 값을 읽어 Vercel의 production/preview/development 환경에 등록한다.
# 이미 등록된 변수는 지우고 다시 넣는다(값 갱신).

$ErrorActionPreference = 'Continue'

# .env.local 파싱
$env_map = @{}
foreach ($raw in Get-Content '.env.local' -Encoding UTF8) {
    $line = $raw.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { continue }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim().Trim('"')
    $env_map[$k] = $v
}

# Vercel에 등록할 변수 목록. VERCEL_OIDC_TOKEN은 제외(자동 생성됨).
$targets = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_KAKAO_JS_KEY',
    'KAKAO_ADMIN_KEY'
)

$envs = @('production', 'preview', 'development')

foreach ($name in $targets) {
    $value = $env_map[$name]
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Output "SKIP  $name (값 없음)"
        continue
    }

    foreach ($e in $envs) {
        # 기존 값 제거 (없으면 조용히 실패)
        vercel env rm $name $e --yes 2>&1 | Out-Null
        # 새 값 등록 (표준 입력으로 전달해 셸 이스케이프 문제를 피한다)
        $value | vercel env add $name $e 2>&1 | Out-Null
    }
    $masked = if ($value.Length -gt 16) { $value.Substring(0, 12) + '...' } else { $value }
    Write-Output "OK    $name = $masked"
}

Write-Output ''
Write-Output '등록된 환경 변수 목록:'
vercel env ls 2>&1 | Select-String -NotMatch 'node.exe|위치|basedir|CategoryInfo|FullyQualified|~~~|^\s*\+'
