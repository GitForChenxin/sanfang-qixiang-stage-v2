// 福州三坊七巷（1:1 OpenStreetMap 真实矢量街区 + 衣锦坊 4 号水榭戏台核心院落）空间参数（V3-GIS）
// 坐标锚点：以衣锦坊 4 号水榭戏台（26.08659°N, 119.29119°E，WGS-84）为原点 (0, 0)
// 坐标约定：+Z = 正北 (+lat)，-Z = 正南 (-lat)，+X = 正西 (-lon)，-X = 正东 (+lon)

export const architecture = Object.freeze({
  version: 'V3-GIS',
  compass: Object.freeze({
    north: '+Z',
    south: '-Z',
    west: '+X',
    east: '-X'
  }),
  geoAnchor: Object.freeze({
    lat: 26.08659,
    lon: 119.29119,
    source: 'OpenStreetMap (ODbL)'
  }),
  pool: Object.freeze({
    // 官源记载水池约 60 平方米；取 6.85m × 8.80m ≈ 60.28㎡（依总面积推定，长宽比为示意）
    width: 6.85,
    depth: 8.80,
    areaSqm: 60.28,
    zCenter: -0.45,
    zMin: -4.85,
    zMax: 3.95,
    y: -0.34,
    floorY: -1.18
  }),
  stage: Object.freeze({
    // 官源记载戏台约 30 平方米、四柱单开间坐南朝北；取 5.50m × 5.50m ≈ 30.25㎡（非实测）
    width: 5.50,
    depth: 5.50,
    areaSqm: 30.25,
    z: -2.05,
    north: '+Z',
    deckY: 0.72,
    eaveY: 4.12,
    ridgeRise: 1.94,
    // 四根花岗岩石墩与四根杉木柱均立于台面内收位置（相对台边内收 0.70m，示意）
    columns: Object.freeze([
      [-2.05, -2.05],
      [2.05, -2.05],
      [-2.05, 2.05],
      [2.05, 2.05]
    ])
  }),
  balustradeNorth: Object.freeze({
    // 池北岸连续浮雕花卉花岗岩石栏（立于池北沿）
    z: 4.08,
    width: 7.10,
    bays: 6,
    height: 0.62
  }),
  westWalls: Object.freeze({
    // 仅在戏台水池西侧设白灰曲线福建马鞍墙与带雪洞矮墙（不使用徽派阶梯马头墙）
    lowWallX: 3.74,
    saddleWallX: 4.92
  }),
  hall: Object.freeze({
    // 对岸双层前廊后堂花厅，后堂朝南设 12 扇木格门窗（4+4+4 排布，具体开间进深为示意）
    z: 7.55,
    verandaFrontZ: 7.78,
    facadeZ: 9.35,
    rearZ: 12.60,
    width: 9.80,
    southDoorLeaves: 12,
    stories: 2,
    north: '+Z'
  }),
  // 保留 4 个水榭戏台核心预设视角：[camX, camY, camZ, targetX, targetY, targetZ]
  views: Object.freeze({
    // 01 默认视角：对岸花厅一侧约 1.6m 眼高隔池正看水榭戏台
    front: Object.freeze([0.10, 1.64, 7.18, 0.0, 2.54, -2.05]),
    // 02 东北池岸斜看戏台（呼应 Siyuwj #20 斜拍构图，同时可见西侧马鞍墙与雪洞矮墙）
    side: Object.freeze([-5.15, 1.60, 3.15, 0.45, 2.65, -1.80]),
    // 03 檐下仰看瓦垄、瓦当、密集椽木、雕花弓梁、垂莲柱与三层方形藻井
    roof: Object.freeze([-3.25, 2.45, 1.05, 0.15, 4.15, -2.05]),
    // 04 回看对岸池北浮雕花卉石栏与双层前廊后堂花厅（12 扇朝南木格门窗）
    hall: Object.freeze([-3.45, 1.72, -0.45, 0.10, 2.85, 8.95])
  }),
  // 真实 1:1 三坊七巷全街区（约 760m × 760m）探索视角
  districtOverview: Object.freeze([-45.0, 330.0, 290.0, -78.0, 0.0, -82.0]),
  nanhouStreetView: Object.freeze([-24.5, 4.6, 250.0, -30.5, 3.4, 218.0]),
  heartTreeView: Object.freeze([-92.0, 3.0, -138.0, -96.5, 4.2, -158.0]),
  yijinfangEntryView: Object.freeze([-58.5, 3.6, -4.5, -72.0, 3.4, -7.0]),
  // 无测绘依据细节的「示意」边界清单
  illustrativeNotes: Object.freeze([
    '水池（约 60㎡）与戏台（5.5×5.5m，约 30㎡）系据官源面积推定，非实测尺寸（示意）',
    '四柱内收进深、石墩石梁截面、雕花挂板/石栏浮雕/藻井团鹤四蝠纹样（示意）',
    '九脊歇山顶起翘曲率、瓦垄/瓦当/滴水/椽木密度、雕花弓梁花板与垂莲柱轮廓（示意）',
    '后墙淡墨山水壁画构图、西侧福建曲线马鞍墙曲率与带雪洞矮墙洞口轮廓（示意）',
    '对岸双层花厅二层形制、12 扇朝南木格窗棂图案与座椅灯笼陈设（示意）',
    '全街区 682 栋建筑基底轮廓与 86 条路网采用 1:1 OpenStreetMap 真实地理矢量（ODbL）；建筑檐高、马鞍墙具体曲率、明清骑楼/民国洋楼立面细部、牌坊匾额、爱心树冠与夜景亮灯为风貌示意'
  ])
});
