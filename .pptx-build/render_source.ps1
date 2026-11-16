$ErrorActionPreference = 'Stop'
$source = 'C:\Users\Xuân Hoàng\Desktop\067205000731_Trương Xuân Hoàng_TTTN\067205000731_Trương Xuân Hoàng_Báo Cáo TTTN.pptx'
$out = 'C:\Users\Xuân Hoàng\Desktop\Website\.pptx-build\source.pdf'
$ppt = $null
$deck = $null
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $deck = $ppt.Presentations.Open($source, $true, $false, $false)
    $deck.SaveAs($out, 32)
    Write-Output ('Slides=' + $deck.Slides.Count)
    Write-Output ('Width=' + $deck.PageSetup.SlideWidth)
    Write-Output ('Height=' + $deck.PageSetup.SlideHeight)
    $deck.Close()
    $deck = $null
} finally {
    if ($null -ne $deck) { $deck.Close() }
    if ($null -ne $ppt) { $ppt.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null }
}
