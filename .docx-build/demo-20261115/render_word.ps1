$ErrorActionPreference = 'Stop'
$taskRoot = 'C:\Users\Xuân Hoàng\Desktop\Website'
$docxPath = Join-Path $taskRoot 'outputs\Kich_ban_thuyet_trinh_va_demo_AnhTraiStore.docx'
$pdfPath = Join-Path $taskRoot '.docx-build\demo-20261115\word-preview.pdf'
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($docxPath, $false, $true)
    $document.Repaginate()
    $document.Fields.Update() | Out-Null
    $document.ExportAsFixedFormat($pdfPath, 17)
    Write-Output ('Pages=' + $document.ComputeStatistics(2))
    Write-Output $pdfPath
    $document.Close($false)
    $document = $null
} finally {
    if ($null -ne $document) { $document.Close($false) }
    if ($null -ne $word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}
