# 将 OpenStreetMap 真实矢量数据（sanfang-qixiang.osm + sanfang-qixiang-west.osm）
# 转换为以「衣锦坊 4 号水榭戏台」为坐标原点 (0,0) 的 1:1 真实米制三维底图 JSON。
# 坐标约定：+Z = 北 (+lat), -Z = 南 (-lat), +X = 西 (-lon), -X = 东 (+lon)

$ErrorActionPreference = 'Stop'
$baseDir = 'g:\AI WorkSpace\Gemini\sanfang-qixiang-stage-v2'
$eastFile = Join-Path $baseDir 'data\sanfang-qixiang.osm'
$westFile = Join-Path $baseDir 'data\sanfang-qixiang-west.osm'
$outFile  = Join-Path $baseDir 'data\district-osm.json'

# 锚点：水榭戏台 (26.08647, 119.29119) 略向北微调至 26.08659，使衣锦坊巷道恰好贴合戏台院落南侧真实入口
$lat0 = 26.08659
$lon0 = 119.29119
$cos0 = [math]::Cos($lat0 * [math]::PI / 180.0)
$M = 111195.0

function To-XZ([double]$lat, [double]$lon) {
  $x = -($lon - $lon0) * $M * $cos0
  $z = ($lat - $lat0) * $M
  return @([math]::Round($x, 2), [math]::Round($z, 2))
}

# 读取并合并东西两份 OSM XML
$nodeMap = @{}
$wayMap = @{}
foreach ($file in @($eastFile, $westFile)) {
  if (-not (Test-Path $file)) { throw "Missing OSM file: $file" }
  $xml = [xml](Get-Content -Raw -Encoding UTF8 $file)
  foreach ($n in $xml.osm.node) {
    $tags = @{}
    if ($n.tag) { foreach ($t in $n.tag) { $tags[$t.k] = $t.v } }
    $nodeMap[$n.id] = [pscustomobject]@{ lat = [double]$n.lat; lon = [double]$n.lon; tags = $tags }
  }
  foreach ($w in $xml.osm.way) {
    $wayMap[$w.id] = $w
  }
}

# 三坊七巷核心与周边骨架裁剪边界（约 760m × 760m，完整覆盖通湖路—八一七路、杨桥路—安泰河）
$XMin = -420.0; $XMax = 315.0
$ZMin = -455.0; $ZMax = 285.0

# 1. 提取所有真实道路与水系折线
$roads = New-Object System.Collections.Generic.List[object]
$waters = New-Object System.Collections.Generic.List[object]
$nanhouPts = New-Object System.Collections.Generic.List[object]
$namedRoads = @{}

$roadWidthMap = @{
  'primary' = 13.0; 'secondary' = 11.5; 'tertiary' = 9.0;
  'residential' = 5.4; 'unclassified' = 5.2; 'living_street' = 5.0;
  'pedestrian' = 6.2; 'service' = 3.8; 'footway' = 3.2; 'path' = 2.6
}

foreach ($w in $wayMap.Values) {
  $tags = @{}
  if ($w.tag) { foreach ($t in $w.tag) { $tags[$t.k] = $t.v } }
  $pts = New-Object System.Collections.Generic.List[object]
  foreach ($nd in $w.nd) {
    if ($nodeMap.ContainsKey($nd.ref)) {
      $n = $nodeMap[$nd.ref]
      $pts.Add((To-XZ $n.lat $n.lon))
    }
  }
  if ($pts.Count -lt 2) { continue }

  # 检查是否在裁剪范围内（至少一点落在扩展框内）
  $inBox = $false
  foreach ($p in $pts) {
    if ($p[0] -ge ($XMin - 40) -and $p[0] -le ($XMax + 40) -and $p[1] -ge ($ZMin - 40) -and $p[1] -le ($ZMax + 40)) {
      $inBox = $true; break
    }
  }
  if (-not $inBox) { continue }

  if ($tags.ContainsKey('highway')) {
    $hw = $tags['highway']
    if ($hw -eq 'steps' -or $hw -eq 'elevator' -or $hw -eq 'corridor') { continue }
    $nm = if ($tags.ContainsKey('name')) { $tags['name'] } else { '' }
    $width = if ($roadWidthMap.ContainsKey($hw)) { $roadWidthMap[$hw] } else { 4.2 }
    $kind = 'alley'
    if ($nm -eq '南后街') {
      $width = 7.6; $kind = 'nanhou'
      foreach ($p in $pts) { $nanhouPts.Add($p) }
    } elseif ($nm -match '^(衣锦坊|文儒坊|光禄坊|郎官巷|塔巷|黄巷|安民巷|宫巷|吉庇巷)$') {
      $width = 4.8; $kind = 'historic_lane'
    } elseif ($nm -match '八一七|通湖|杨桥|东街|澳门|津泰|道山') {
      $width = [math]::Max($width, 10.5); $kind = 'avenue'
    }
    if ($nm) {
      if (-not $namedRoads.ContainsKey($nm)) { $namedRoads[$nm] = New-Object System.Collections.Generic.List[object] }
      foreach ($p in $pts) { $namedRoads[$nm].Add($p) }
    }
    $roads.Add([pscustomobject]@{ name = $nm; kind = $kind; width = $width; pts = $pts })
  } elseif ($tags.ContainsKey('waterway') -or $tags['natural'] -eq 'water') {
    $isPoly = ($tags['natural'] -eq 'water') -and ($pts.Count -ge 4)
    $nm = if ($tags.ContainsKey('name')) { $tags['name'] } else { if ($tags['waterway'] -eq 'canal') { '安泰河' } else { '' } }
    $waters.Add([pscustomobject]@{
      name = $nm
      kind = if ($isPoly) { 'pond' } else { 'canal' }
      width = if ($tags['waterway'] -eq 'canal') { 9.5 } else { 4.0 }
      pts = $pts
    })
  }
}

# 辅助：计算点到南后街折线的近似最短距离与相对东西侧
function Get-NanhouDist([double]$x, [double]$z) {
  # 南后街近似直线（自北 (-27, 235) 至南 (-138, -381)），同时与采样点求精
  $best = 9999.0
  foreach ($p in $nanhouPts) {
    $d = [math]::Sqrt([math]::Pow($x - $p[0], 2) + [math]::Pow($z - $p[1], 2))
    if ($d -lt $best) { $best = $d }
  }
  return $best
}

# 辅助：最小面积旋转外接矩形（OBB），用于对齐真实的屋脊方向与福建马鞍墙山墙两端
function Get-PolygonOBB($pts) {
  $n = $pts.Count
  $bestArea = 1e18
  $best = $null
  # 遍历多边形各边方向作为候选主轴（高效精确）
  for ($i = 0; $i -lt $n; $i++) {
    $p0 = $pts[$i]; $p1 = $pts[($i + 1) % $n]
    $dx = $p1[0] - $p0[0]; $dz = $p1[1] - $p0[1]
    $len = [math]::Sqrt($dx * $dx + $dz * $dz)
    if ($len -lt 0.3) { continue }
    $ux = $dx / $len; $uz = $dz / $len
    $vx = -$uz; $vz = $ux
    $minU = 1e9; $maxU = -1e9; $minV = 1e9; $maxV = -1e9
    foreach ($p in $pts) {
      $u = $p[0] * $ux + $p[1] * $uz
      $v = $p[0] * $vx + $p[1] * $vz
      if ($u -lt $minU) { $minU = $u }; if ($u -gt $maxU) { $maxU = $u }
      if ($v -lt $minV) { $minV = $v }; if ($v -gt $maxV) { $maxV = $v }
    }
    $du = $maxU - $minU; $dv = $maxV - $minV
    $area = $du * $dv
    if ($area -lt $bestArea) {
      $bestArea = $area
      $cu = ($minU + $maxU) * 0.5; $cv = ($minV + $maxV) * 0.5
      $cx = $cu * $ux + $cv * $vx
      $cz = $cu * $uz + $cv * $vz
      # 确保 length >= width，angle 为屋脊（长边）朝向
      if ($du -ge $dv) {
        $ang = [math]::Atan2($uz, $ux)
        $best = [pscustomobject]@{ cx=$cx; cz=$cz; len=$du; wid=$dv; ang=$ang }
      } else {
        $ang = [math]::Atan2($vz, $vx)
        $best = [pscustomobject]@{ cx=$cx; cz=$cz; len=$dv; wid=$du; ang=$ang }
      }
    }
  }
  return $best
}

# 2. 提取全部真实建筑多边形（带 OBB 主轴与 6 类福州建筑风格分类）
$buildings = New-Object System.Collections.Generic.List[object]
$seed = 202604

foreach ($w in $wayMap.Values) {
  $tags = @{}
  if ($w.tag) { foreach ($t in $w.tag) { $tags[$t.k] = $t.v } }
  if (-not $tags.ContainsKey('building')) { continue }

  $pts = New-Object System.Collections.Generic.List[object]
  foreach ($nd in $w.nd) {
    if ($nodeMap.ContainsKey($nd.ref)) {
      $n = $nodeMap[$nd.ref]
      $pts.Add((To-XZ $n.lat $n.lon))
    }
  }
  if ($pts.Count -lt 4) { continue }
  # 去掉首尾重复闭合点
  if ($pts[0][0] -eq $pts[$pts.Count - 1][0] -and $pts[0][1] -eq $pts[$pts.Count - 1][1]) {
    $pts.RemoveAt($pts.Count - 1)
  }
  if ($pts.Count -lt 3) { continue }

  # 计算质心与多边形面积
  $sx = 0.0; $sz = 0.0; $area2 = 0.0
  for ($i = 0; $i -lt $pts.Count; $i++) {
    $p0 = $pts[$i]; $p1 = $pts[($i + 1) % $pts.Count]
    $sx += $p0[0]; $sz += $p0[1]
    $area2 += ($p0[0] * $p1[1] - $p1[0] * $p0[1])
  }
  $cx = $sx / $pts.Count; $cz = $sz / $pts.Count
  $polyArea = [math]::Abs($area2) * 0.5
  if ($polyArea -lt 8.0) { continue }

  # 过滤超出三坊七巷及外围框的建筑
  if ($cx -lt $XMin -or $cx -gt $XMax -or $cz -lt $ZMin -or $cz -gt $ZMax) { continue }

  # 精准避让 1:1 手工精建的「衣锦坊 4 号水榭戏台与花厅核心院落」(X∈[-7.5,7.5], Z∈[-9.5,14.0])
  if ($cx -gt -8.5 -and $cx -lt 8.5 -and $cz -gt -10.5 -and $cz -lt 15.0) { continue }

  $obb = Get-PolygonOBB $pts
  if ($null -eq $obb) { continue }

  $nm = if ($tags.ContainsKey('name')) { $tags['name'] } else { '' }
  $bType = $tags['building']
  $distNH = Get-NanhouDist $cx $cz
  $seed = (($seed * 1664525) + 1013904223) -band 0x7fffffff
  $r = ($seed % 1000) / 1000.0

  # 判断建筑是否处于历史核心保护区 vs 外围现代商业街区（如八一七北路东百/大厦带、杨桥路北）
  $isModernEdge = ($nm -match '大厦|中心|百货|医院|银行|酒店|公寓') -or ($cx -lt -325) -or ($cz -gt 245) -or ($cx -lt -245 -and $cz -gt 140 -and $polyArea -gt 650)

  $style = 'min_mansion'
  $height = 5.4 + ($r * 1.4)
  $saddleVar = [int]($seed % 3) # 0:尖峰马鞍墙 1:双波缓弧马鞍墙 2:三叠曲线马鞍墙

  if ($tags['building'] -eq 'temple' -or $nm -match '天后宫|法海寺|书院') {
    $style = 'temple'
    $height = 7.2
  } elseif ($isModernEdge) {
    $style = 'modern_edge'
    $height = if ($nm -match '大厦|中心') { 16.0 + $r * 10.0 } else { 11.0 + $r * 6.0 }
  } elseif ($distNH -lt 22.0 -and $cz -gt -385 -and $cz -lt 235) {
    # 南后街两侧：62% 明清双层木构骑楼商铺，38% 民国红/青砖拱券洋楼
    if ($r -lt 0.38) {
      $style = if ($r -lt 0.20) { 'republican_red' } else { 'republican_grey' }
      $height = 6.6 + $r * 2.2
    } else {
      $style = 'nanhou_arcade'
      $height = 5.8 + $r * 1.4
    }
  } elseif ($cz -gt 145 -and $cx -lt -30 -and $cx -gt -250 -and $r -lt 0.28) {
    # 郎官巷/杨桥东路一带穿插民国砖混洋楼
    $style = if ($r -lt 0.14) { 'republican_red' } else { 'republican_grey' }
    $height = 6.2 + $r * 1.8
  } else {
    # 三坊七巷核心古民居大厝（白灰墙/局部青砖墙）
    $style = if ($r -lt 0.16) { 'min_greybrick' } else { 'min_mansion' }
    $height = if ($polyArea -gt 260) { 5.8 + $r * 1.5 } else { 4.8 + $r * 1.3 }
  }

  # 若 OSM 有明确层数或高度标签则优先参考
  if ($tags.ContainsKey('height') -and $tags['height'] -match '^\d+(\.\d+)?') {
    $height = [double]$Matches[0]
  } elseif ($tags.ContainsKey('building:levels') -and $tags['building:levels'] -match '^\d+') {
    $height = [double]$Matches[0] * 3.4
  }

  $buildings.Add([pscustomobject]@{
    id = $w.id
    name = $nm
    style = $style
    sv = $saddleVar
    h = [math]::Round($height, 2)
    cx = [math]::Round($obb.cx, 2)
    cz = [math]::Round($obb.cz, 2)
    len = [math]::Round($obb.len, 2)
    wid = [math]::Round($obb.wid, 2)
    ang = [math]::Round($obb.ang, 4)
    area = [math]::Round($polyArea, 1)
    pts = $pts
  })
}

# 3. 计算各坊巷与南后街的真实交汇坐标，用于精准安放坊口牌坊与地标铭牌
function Find-LaneAnchor($laneName) {
  if (-not $namedRoads.ContainsKey($laneName)) { return $null }
  $pts = $namedRoads[$laneName]
  # 找最接近南后街的点（作为牌坊口）以及坊巷中段点（作为导览浮标）
  $bestD = 9999.0; $entry = $pts[0]
  $sx = 0.0; $sz = 0.0
  foreach ($p in $pts) {
    $sx += $p[0]; $sz += $p[1]
    $d = Get-NanhouDist $p[0] $p[1]
    if ($d -lt $bestD) { $bestD = $d; $entry = $p }
  }
  $mid = @([math]::Round($sx / $pts.Count, 1), [math]::Round($sz / $pts.Count, 1))
  # 计算入口段方向角
  $dirPt = $pts[0]
  $farD = 0.0
  foreach ($p in $pts) {
    $d = [math]::Sqrt([math]::Pow($p[0] - $entry[0], 2) + [math]::Pow($p[1] - $entry[1], 2))
    if ($d -gt 8.0 -and $d -lt 45.0) { $dirPt = $p; $farD = $d; break }
  }
  if ($farD -eq 0) { $dirPt = $mid }
  $ang = [math]::Atan2($dirPt[1] - $entry[1], $dirPt[0] - $entry[0])
  return [pscustomobject]@{
    name = $laneName
    entry = $entry
    mid = $mid
    ang = [math]::Round($ang, 4)
  }
}

$lanesMeta = New-Object System.Collections.Generic.List[object]
foreach ($ln in @('衣锦坊','文儒坊','光禄坊','郎官巷','塔巷','黄巷','安民巷','宫巷','吉庇巷')) {
  $a = Find-LaneAnchor $ln
  if ($null -ne $a) { $lanesMeta.Add($a) }
}

# 提取南后街真实南北端点与主要 OSM POI
$nhNorth = $nanhouPts | Sort-Object { $_[1] } -Descending | Select-Object -First 1
$nhSouth = $nanhouPts | Sort-Object { $_[1] } | Select-Object -First 1

$pois = New-Object System.Collections.Generic.List[object]
foreach ($n in $nodeMap.Values) {
  $nm = $n.tags['name']
  if (-not $nm) { continue }
  $xz = To-XZ $n.lat $n.lon
  if ($xz[0] -lt $XMin -or $xz[0] -gt $XMax -or $xz[1] -lt $ZMin -or $xz[1] -gt $ZMax) { continue }
  if ($nm -match '水榭|严复|天后宫|林觉民|冰心|小黄楼|二梅|沈葆桢|艺术馆|博物馆|展示馆|研究院|陈列馆|书院') {
    $pois.Add([pscustomobject]@{ name = $nm; x = $xz[0]; z = $xz[1] })
  }
}

$payload = [pscustomobject]@{
  meta = [pscustomobject]@{
    source = 'OpenStreetMap (ODbL)'
    anchor = [pscustomobject]@{ name = '水榭戏台'; lat = $lat0; lon = $lon0 }
    bounds = [pscustomobject]@{ xMin = $XMin; xMax = $XMax; zMin = $ZMin; zMax = $ZMax }
    buildingCount = $buildings.Count
    roadCount = $roads.Count
  }
  nanhou = [pscustomobject]@{
    north = $nhNorth
    south = $nhSouth
  }
  lanes = $lanesMeta
  pois = $pois
  roads = $roads
  waters = $waters
  buildings = $buildings
}

$json = $payload | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $outFile ($([math]::Round($json.Length / 1024, 1)) KB)"
Write-Output "Buildings=$($buildings.Count), Roads=$($roads.Count), Waters=$($waters.Count), Lanes=$($lanesMeta.Count), POIs=$($pois.Count)"
Write-Output "Nanhou North=($($nhNorth[0]),$($nhNorth[1])) South=($($nhSouth[0]),$($nhSouth[1]))"
foreach ($lm in $lanesMeta) {
  Write-Output ("  Lane {0,-5}: entry=({1,6:F1},{2,6:F1}) mid=({3,6:F1},{4,6:F1}) ang={5:F2}" -f $lm.name,$lm.entry[0],$lm.entry[1],$lm.mid[0],$lm.mid[1],$lm.ang)
}
foreach ($p in $pois) {
  Write-Output ("  POI {0}: ({1:F1}, {2:F1})" -f $p.name,$p.x,$p.z)
}
