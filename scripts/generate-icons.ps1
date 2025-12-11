$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brush = [System.Drawing.Brushes]::White
$fontStyle = [System.Drawing.FontStyle]::Bold
$graphicsUnit = [System.Drawing.GraphicsUnit]::Pixel

# 48x48 icon
$path48 = "public/icons/icon-48.png"
$bmp48 = New-Object System.Drawing.Bitmap 48,48
$g48 = [System.Drawing.Graphics]::FromImage($bmp48)
$g48.Clear([System.Drawing.Color]::FromArgb(102,126,234))
$font48 = New-Object System.Drawing.Font -ArgumentList 'Segoe UI',14,$fontStyle,$graphicsUnit
$g48.DrawString('GF', $font48, $brush, 2, 10)
$g48.Dispose()
$bmp48.Save($path48, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp48.Dispose()

# 128x128 icon
$path128 = "public/icons/icon-128.png"
$bmp128 = New-Object System.Drawing.Bitmap 128,128
$g128 = [System.Drawing.Graphics]::FromImage($bmp128)
$g128.Clear([System.Drawing.Color]::FromArgb(79,70,229))
$font128 = New-Object System.Drawing.Font -ArgumentList 'Segoe UI',36,$fontStyle,$graphicsUnit
$g128.DrawString('GF', $font128, $brush, 18, 32)
$g128.Dispose()
$bmp128.Save($path128, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp128.Dispose()
