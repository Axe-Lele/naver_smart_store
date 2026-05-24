# /scripts/generate-brand-assets.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [System.Drawing.RectangleF]$Rect,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $arc = [System.Drawing.RectangleF]::new($Rect.X, $Rect.Y, $diameter, $diameter)
  $path.AddArc($arc, 180, 90)
  $arc.X = $Rect.Right - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Rect.Bottom - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $Rect.X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

$root = Split-Path -Parent $PSScriptRoot
$resourceDir = Join-Path $root 'apps\desktop-electron\resources'
$pngPath = Join-Path $resourceDir 'wishfigure-icon.png'
$icoPath = Join-Path $resourceDir 'wishfigure-icon.ico'

if (-not (Test-Path $resourceDir)) {
  New-Item -ItemType Directory -Path $resourceDir | Out-Null
}

$size = 256
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundRect = [System.Drawing.RectangleF]::new(0, 0, $size, $size)
$path = New-RoundedRectPath -Rect $backgroundRect -Radius 58
$backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $backgroundRect,
  [System.Drawing.ColorTranslator]::FromHtml('#111827'),
  [System.Drawing.ColorTranslator]::FromHtml('#0D4D2B'),
  [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)
$graphics.FillPath($backgroundBrush, $path)

$accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(92, [System.Drawing.ColorTranslator]::FromHtml('#24B84F')))
$graphics.FillEllipse($accentBrush, 128, 128, 156, 156)

$orbitPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#3ED675'), 10)
$orbitPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$orbitPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($orbitPen, 64, 55, 128, 92, 202, 128)

$softOrbitPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(170, [System.Drawing.ColorTranslator]::FromHtml('#B5F5C8')), 7)
$softOrbitPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$softOrbitPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($softOrbitPen, 72, 63, 128, 120, 322, 70)

$font = [System.Drawing.Font]::new('Segoe UI Black', 112, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$stringFormat = [System.Drawing.StringFormat]::new()
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = [System.Drawing.RectangleF]::new(22, 63, 212, 142)
$graphics.DrawString('W', $font, $whiteBrush, $textRect, $stringFormat)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
[System.IO.File]::WriteAllBytes($icoPath, $stream.ToArray())

$writer.Dispose()
$stream.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$backgroundBrush.Dispose()
$accentBrush.Dispose()
$orbitPen.Dispose()
$softOrbitPen.Dispose()
$whiteBrush.Dispose()
$font.Dispose()
$stringFormat.Dispose()
$path.Dispose()
