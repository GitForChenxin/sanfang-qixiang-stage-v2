import * as T from 'three';
import { Reflector } from './Reflector.js';
import { architecture as A } from './model.mjs';
import { saveCourtyard } from './colab-export.mjs';
import { createHeartBanyan } from './heart-tree.mjs';
import { applyColabMaterials, courtyardWaterShader, installSoftEnvironment, installRenderGallery } from './visual-quality.mjs';

const $ = (s) => document.querySelector(s);
const view = $('#viewport');
const statusEl = $('#status');
const fallbackEl = $('#webgl-fallback');
const zoomControls = $('#zoom-controls');
const sceneBadge = $('#scene-badge');
if (!globalThis.__OFFLINE_EXPORT) installRenderGallery();

// 实景照片弹窗：即使在 WebGL 降级模式下也保持完全可用
const photoDialog = $('#photo');
$('#photo-open').addEventListener('click', () => photoDialog.showModal());
$('#photo-close').addEventListener('click', () => photoDialog.close());

// WebGL 不可用时的文字 + 照片降级界面
function activateFallback(reason) {
  if (fallbackEl) fallbackEl.hidden = false;
  if (zoomControls) zoomControls.hidden = true;
  if (sceneBadge) sceneBadge.hidden = true;
  view.dataset.webgl = 'fallback';
  statusEl.textContent = reason || 'WebGL 不可用 · 已切换为图文降级模式';
  document.querySelectorAll('[data-view], #district-overview, #nanhou-street, #heart-tree-view, #mode-orbit, #mode-walk, #time-day, #time-dusk, #quality-enhanced, #quality-original, #reset, #save-view, #zoom-in, #zoom-out').forEach((btn) => {
    btn.disabled = true;
  });
  const noteEl = $('#view-note');
  if (noteEl) {
    noteEl.textContent = '当前环境未启用 WebGL，已在左侧展示实景照片与衣锦坊 4 号水榭戏台及三坊七巷文字说明（无测绘依据项均已标注「示意」）。';
  }
}

const forceFallback = new URLSearchParams(location.search).get('fallback') === '1';
let R = null;
if (forceFallback) {
  activateFallback('已启用图文降级预览模式');
} else {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) {
      activateFallback('当前浏览器不支持 WebGL · 已切换为图文降级模式');
    } else {
      R = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    }
  } catch (_err) {
    activateFallback('无法开启 WebGL · 已切换为图文降级模式');
  }
}

if (R) {
  initScene(R).catch((err) => {
    console.error(err);
    statusEl.textContent = '三维场景加载出错，请刷新重试';
  });
}

// 轻量级 BufferGeometry 合并器（零外链依赖，用于将 682 栋真实多边形按材质合批为极少 Draw Calls）
function mergeGeoList(geos) {
  if (!geos.length) return null;
  const normalized = [];
  let totalVerts = 0;
  for (const raw of geos) {
    const g = raw.index ? raw.toNonIndexed() : raw;
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    normalized.push({ g, pos, norm, uv, count: pos.count });
    totalVerts += pos.count;
  }
  if (!totalVerts) return null;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  let offset = 0;
  for (const item of normalized) {
    positions.set(item.pos.array, offset * 3);
    normals.set(item.norm.array, offset * 3);
    if (item.uv) {
      uvs.set(item.uv.array, offset * 2);
    }
    offset += item.count;
    item.g.dispose();
  }
  const merged = new T.BufferGeometry();
  merged.setAttribute('position', new T.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new T.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new T.BufferAttribute(uvs, 2));
  return merged;
}

async function initScene(renderer) {
  statusEl.textContent = '正在加载 1:1 三坊七巷地理底图…';
  let osmData = null;
  try {
    const resp = await fetch('./data/district-osm.json');
    if (resp.ok) osmData = await resp.json();
  } catch (_e) {
    osmData = null;
  }

  const scene = new T.Scene();
  scene.background = new T.Color(0xd8e2de);
  scene.fog = new T.Fog(0xd8e2de, 380, 1150);

  const camera = new T.PerspectiveCamera(56, 1, 0.1, 1650);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.AgXToneMapping;
  renderer.toneMappingExposure = 1.02;
  view.append(renderer.domElement);
  if (!globalThis.__OFFLINE_EXPORT) installSoftEnvironment(scene, renderer);

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    activateFallback('WebGL 渲染上下文已丢失 · 已切换为图文降级模式');
  });

  // 晴朗白昼 / 华灯初上（夜景）可切换天穹渐变
  const skyGeo = new T.SphereGeometry(1350, 32, 20);
  const skyUniforms = {
    topColor: { value: new T.Color(0x5b99d1) },
    midColor: { value: new T.Color(0xbcd7e7) },
    horizonColor: { value: new T.Color(0xd8e2de) }
  };
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.02, 0.28, h));
        col = mix(col, topColor, smoothstep(0.24, 0.82, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  scene.add(new T.Mesh(skyGeo, skyMat));

  // 多层自然采光 + 相机跟随动态阴影（保障 760m × 760m 1:1 全区处处阴影锐利）
  const hemiLight = new T.HemisphereLight(0xeaf4ff, 0xb09d80, 1.50);
  scene.add(hemiLight);

  const sunOffset = new T.Vector3(-42, 68, 36);
  const sun = new T.DirectionalLight(0xfff1d6, 2.55);
  sun.position.copy(sunOffset);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -46, right: 46, top: 46, bottom: -46, near: 4.0, far: 185
  });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.032;
  scene.add(sun);
  scene.add(sun.target);

  const waterBounce = new T.DirectionalLight(0xdaf0e8, 0.72);
  waterBounce.position.set(4, -9, 6);
  scene.add(waterBounce);

  const eaveFill = new T.PointLight(0xfaefd9, 2.55, 14.5, 1.32);
  eaveFill.position.set(0, 3.05, A.stage.z + 0.55);
  scene.add(eaveFill);

  // 确定性伪随机数
  let seed = 350102;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  // ==================== 高精细多风格程序化纹理库 ====================
  function makeTexture(width, height, drawFn, repeatX = 1, repeatY = 1, isColor = true) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');
    drawFn(g, width, height);
    const t = new T.CanvasTexture(c);
    if (isColor) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 8;
    return t;
  }

  // 1. 细腻旧杉木纹（漫反射 + 凹凸）
  const texWoodDark = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6c4d39';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3400; i++) {
      g.fillStyle = rnd() > 0.45 ? '#352216' : '#8e6b50';
      g.globalAlpha = 0.07 + rnd() * 0.13;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 16 + rnd() * 76);
    }
    g.globalAlpha = 0.18;
    g.fillStyle = '#29180f';
    for (let i = 0; i < 20; i++) g.fillRect(rnd() * w, 0, 1.3, h);
  });
  const texWoodBump = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#7c7c7c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = rnd() > 0.5 ? '#b4b4b4' : '#404040';
      g.globalAlpha = 0.12;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 18 + rnd() * 70);
    }
  }, 1, 1, false);

  const texWoodPale = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b9aa97';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rnd() > 0.5 ? '#8a7a68' : '#d5cab9';
      g.globalAlpha = 0.08 + rnd() * 0.12;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 12 + rnd() * 64);
    }
  });

  // 2. 花岗岩条石（含临水石墩苔渍渐变）
  const texGranite = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c2beb3';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5400; i++) {
      const v = rnd();
      g.fillStyle = v > 0.65 ? '#e1ded5' : v > 0.3 ? '#8e8c82' : '#585852';
      g.globalAlpha = 0.12 + rnd() * 0.17;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    g.globalAlpha = 0.25;
    g.fillStyle = '#5c5a53';
    for (let r = 0; r < 4; r++) {
      g.fillRect(0, r * 64, w, 2);
      for (let c = 0; c < 3; c++) g.fillRect((c * 85 + (r % 2) * 42) % w, r * 64, 2, 64);
    }
  });
  const texGranitePier = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#beb9ad';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = rnd() > 0.5 ? '#d9d5ca' : '#7b796f';
      g.globalAlpha = 0.14;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    const grad = g.createLinearGradient(0, h * 0.45, 0, h);
    grad.addColorStop(0, 'rgba(65,78,60,0)');
    grad.addColorStop(0.55, 'rgba(54,68,51,0.34)');
    grad.addColorStop(1, 'rgba(34,46,35,0.62)');
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.fillRect(0, h * 0.45, w, h * 0.55);
  });

  // 3. 福建白灰墙（院落高墙，1:1 真实米制平铺）
  const texLimeWall = makeTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      g.fillStyle = rnd() > 0.5 ? '#dad4c5' : '#fcfbf7';
      g.globalAlpha = 0.05 + rnd() * 0.09;
      g.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 14, 4 + rnd() * 22);
    }
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w;
      const grad = g.createLinearGradient(x, 0, x, 90 + rnd() * 230);
      grad.addColorStop(0, 'rgba(92,90,82,0.16)');
      grad.addColorStop(1, 'rgba(92,90,82,0)');
      g.globalAlpha = 1;
      g.fillStyle = grad;
      g.fillRect(x, 0, 4 + rnd() * 18, 230);
    }
  });
  const texLimeMeter = texLimeWall.clone();
  texLimeMeter.needsUpdate = true;
  texLimeMeter.repeat.set(0.16, 0.16);

  // 4. 福州青砖古厝墙面（真实三坊七巷深宅常见青砖墙 + 石框漏窗，1:1 约 6.2m×6.2m）
  const texGreyBrickWall = makeTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#7a8082';
    g.fillRect(0, 0, w, h);
    const rows = 24, cols = 10;
    const rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const shade = 114 + Math.floor((rnd() - 0.5) * 28);
        g.fillStyle = `rgb(${shade - 3},${shade + 1},${shade + 4})`;
        g.fillRect(c * cw + off + 1, r * rh + 1, cw - 2, rh - 2);
      }
    }
    // 传统白灰框小花窗点缀
    for (const wx of [w * 0.25, w * 0.75]) {
      g.fillStyle = '#dad4c8';
      g.fillRect(wx - 42, h * 0.26, 84, 96);
      g.fillStyle = '#332922';
      g.fillRect(wx - 32, h * 0.26 + 10, 64, 76);
      g.strokeStyle = '#9c8b76';
      g.lineWidth = 3;
      g.strokeRect(wx - 24, h * 0.26 + 18, 48, 60);
    }
  }, 0.16, 0.16, true);

  // 5. 民国清水红砖 / 青砖拱券洋楼立面（漫反射 + 夜景暖光自发光蒙版，1:1 约 6.4m×6.4m）
  function buildRepublicanFacade(isRed, emissiveOnly) {
    return makeTexture(512, 512, (g, w, h) => {
      if (emissiveOnly) {
        g.fillStyle = '#000000';
        g.fillRect(0, 0, w, h);
      } else {
        g.fillStyle = isRed ? '#964938' : '#7b8184';
        g.fillRect(0, 0, w, h);
        const rows = 26, cols = 12;
        const rh = h / rows, cw = w / cols;
        for (let r = 0; r < rows; r++) {
          const off = (r % 2) * cw * 0.5;
          for (let c = -1; c <= cols; c++) {
            const d = Math.floor((rnd() - 0.5) * 24);
            g.fillStyle = isRed
              ? `rgb(${148 + d},${74 + Math.floor(d * 0.5)},${56 + Math.floor(d * 0.4)})`
              : `rgb(${122 + d},${128 + d},${131 + d})`;
            g.fillRect(c * cw + off + 1, r * rh + 1, cw - 2, rh - 2);
          }
        }
        // 民国洋楼白色灰塑腰线与女儿墙线脚
        g.fillStyle = '#ebe5d8';
        g.fillRect(0, 0, w, 24);
        g.fillRect(0, h * 0.48, w, 22);
        g.fillRect(0, h - 38, w, 38);
      }
      // 两层连续半圆券廊拱窗（每格两拱）
      for (const wy of [h * 0.12, h * 0.58]) {
        const winH = h * 0.30;
        for (const wx of [w * 0.25, w * 0.75]) {
          if (!emissiveOnly) {
            // 白灰拱券外框与拱心石
            g.fillStyle = '#efeae0';
            g.beginPath();
            g.arc(wx, wy + 58, 66, Math.PI, 0, false);
            g.lineTo(wx + 66, wy + winH);
            g.lineTo(wx - 66, wy + winH);
            g.closePath();
            g.fill();
          }
          // 暖色窗格玻璃（夜景发光区域）
          g.fillStyle = emissiveOnly ? '#ffbe66' : '#dfd2b5';
          g.beginPath();
          g.arc(wx, wy + 58, 52, Math.PI, 0, false);
          g.lineTo(wx + 52, wy + winH - 10);
          g.lineTo(wx - 52, wy + winH - 10);
          g.closePath();
          g.fill();
          // 木格窗棂条
          g.strokeStyle = emissiveOnly ? '#000000' : '#4a3223';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(wx, wy + 6); g.lineTo(wx, wy + winH - 10);
          g.moveTo(wx - 52, wy + 58); g.lineTo(wx + 52, wy + 58);
          g.moveTo(wx - 52, wy + 106); g.lineTo(wx + 52, wy + 106);
          g.stroke();
        }
      }
    }, 0.155, 0.155, true);
  }
  const texRepRedColor = buildRepublicanFacade(true, false);
  const texRepGreyColor = buildRepublicanFacade(false, false);
  const texRepEmissive = buildRepublicanFacade(true, true);

  // 6. 南后街明清传统双层木构商铺骑楼立面（漫反射 + 夜景自发光蒙版）
  function buildNanhouArcadeFacade(emissiveOnly) {
    return makeTexture(512, 512, (g, w, h) => {
      if (emissiveOnly) {
        g.fillStyle = '#000000';
        g.fillRect(0, 0, w, h);
      } else {
        g.fillStyle = '#4c3424';
        g.fillRect(0, 0, w, h);
        // 竖向深杉木柱与横枋
        g.fillStyle = '#382418';
        for (const x of [0, w * 0.5 - 12, w - 24]) g.fillRect(x, 0, 24, h);
        g.fillRect(0, h * 0.47, w, 28);
        g.fillRect(0, 0, w, 22);
      }
      // 一层铺面暖光格扇门 + 二层冰裂/步步锦花格窗
      for (const [wy, wh] of [[42, 175], [276, 185]]) {
        for (const wx of [34, w * 0.5 + 22]) {
          const ww = w * 0.5 - 56;
          g.fillStyle = emissiveOnly ? '#ffb957' : '#e0d1b0';
          g.fillRect(wx, wy, ww, wh);
          g.strokeStyle = emissiveOnly ? '#000000' : '#4a3121';
          g.lineWidth = 6;
          g.strokeRect(wx, wy, ww, wh);
          g.lineWidth = 3;
          for (let i = 1; i < 4; i++) {
            const lx = wx + (i / 4) * ww;
            g.beginPath(); g.moveTo(lx, wy); g.lineTo(lx, wy + wh); g.stroke();
          }
          for (let j = 1; j < 4; j++) {
            const ly = wy + (j / 4) * wh;
            g.beginPath(); g.moveTo(wx, ly); g.lineTo(wx + ww, ly); g.stroke();
          }
          if (!emissiveOnly && wy > 200) {
            // 底层木裙板
            g.fillStyle = '#5c3f2c';
            g.fillRect(wx, wy + wh - 55, ww, 55);
            g.strokeStyle = '#7c5a41';
            g.strokeRect(wx + 8, wy + wh - 47, ww - 16, 39);
          }
        }
      }
    }, 0.16, 0.16, true);
  }
  const texNanhouWallColor = buildNanhouArcadeFacade(false);
  const texNanhouWallEmissive = buildNanhouArcadeFacade(true);

  // 7. 高精细青黑筒瓦屋面纹理（漫反射 + 凹凸）
  const texClayTile = makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4a5054';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = rnd() > 0.5 ? '#2e3336' : '#6e757a';
      g.globalAlpha = 0.09 + rnd() * 0.13;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 2 + rnd() * 6);
    }
  });
  const texRoofRibsColor = makeTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#474d52';
    g.fillRect(0, 0, w, h);
    const cols = 16, cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const grad = g.createLinearGradient(x, 0, x + cw, 0);
      grad.addColorStop(0.0, '#2a2e31');
      grad.addColorStop(0.28, '#5e656a');
      grad.addColorStop(0.50, '#747b80');
      grad.addColorStop(0.75, '#464c50');
      grad.addColorStop(1.0, '#24282b');
      g.fillStyle = grad;
      g.fillRect(x, 0, cw, h);
    }
    for (let r = 0; r < 18; r++) {
      const y = (r / 18) * h;
      g.fillStyle = 'rgba(20,23,25,0.28)'; g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(180,188,192,0.09)'; g.fillRect(0, y + 3, w, 2);
    }
  }, 3, 2, true);
  const texRoofRibsBump = makeTexture(512, 512, (g, w, h) => {
    const cols = 16, cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const grad = g.createLinearGradient(x, 0, x + cw, 0);
      grad.addColorStop(0.0, '#181818');
      grad.addColorStop(0.45, '#e8e8e8');
      grad.addColorStop(1.0, '#181818');
      g.fillStyle = grad;
      g.fillRect(x, 0, cw, h);
    }
    for (let r = 0; r < 18; r++) {
      g.fillStyle = 'rgba(0,0,0,0.26)';
      g.fillRect(0, (r / 18) * h, w, 4);
    }
  }, 3, 2, false);

  // 8. 青石板坊巷路面（带微湿反光感）
  const texBluestoneLane = makeTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#898e8a';
    g.fillRect(0, 0, w, h);
    const rows = 8, rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -44;
      while (x < w) {
        const bw = 96 + Math.floor(rnd() * 48);
        const shade = 132 + Math.floor((rnd() - 0.5) * 28);
        g.fillStyle = `rgb(${shade - 4},${shade + 1},${shade})`;
        g.fillRect(x + 2, r * rowH + 2, bw - 4, rowH - 4);
        g.strokeStyle = rnd() > 0.68 ? '#4c5749' : '#474a49';
        g.lineWidth = 3;
        g.strokeRect(x + 1, r * rowH + 1, bw - 2, rowH - 2);
        x += bw;
      }
    }
    for (let i = 0; i < 2800; i++) {
      g.fillStyle = rnd() > 0.5 ? '#c7cac4' : '#535855';
      g.globalAlpha = 0.07 + rnd() * 0.09;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 2 + rnd() * 4);
    }
  }, 1, 1, true);

  // 9. 细腻真实叶片簇贴图（Alpha 镂空）
  const texLeafCluster = makeTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.5;
    g.strokeStyle = '#3b2d1f';
    g.lineWidth = 4;
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + 0.3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 68, cy + Math.sin(a) * 68); g.stroke();
    }
    const leafPalette = ['#2f4928', '#3e5e32', '#4c6f3b', '#5d8246', '#6d9350', '#36522c'];
    for (let i = 0; i < 155; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.62) * 102;
      const lx = cx + Math.cos(a) * r, ly = cy + Math.sin(a) * r;
      const rx = 11 + rnd() * 11, ry = 5 + rnd() * 5;
      g.save();
      g.translate(lx, ly);
      g.rotate(a + (rnd() - 0.5) * 1.4);
      g.fillStyle = leafPalette[Math.floor(rnd() * leafPalette.length)];
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,35,16,0.32)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-rx * 0.8, 0); g.lineTo(rx * 0.8, 0); g.stroke();
      g.restore();
    }
  }, 1, 1, true);

  // 10. 雕花挂板、花卉石栏、淡墨山水壁画与藻井团鹤贴图
  function drawCarvedFascia(g, w, h, bumpMode) {
    g.fillStyle = bumpMode ? '#484848' : '#78695b';
    g.fillRect(0, 0, w, h);
    const pw = w / 4;
    for (let i = 0; i < 4; i++) {
      const px = i * pw;
      g.strokeStyle = bumpMode ? '#d8d8d8' : '#b29e88'; g.lineWidth = 5; g.strokeRect(px + 6, 8, pw - 12, h - 16);
      g.strokeStyle = bumpMode ? '#222222' : '#43372d'; g.lineWidth = 3; g.strokeRect(px + 13, 15, pw - 26, h - 30);
      const cx = px + pw * 0.5, cy = h * 0.5;
      g.strokeStyle = bumpMode ? '#f0f0f0' : '#cab59b'; g.lineWidth = 4;
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(cx + s * 28, cy, 18, 0, Math.PI * 1.65); g.stroke();
        g.beginPath(); g.arc(cx + s * 46, cy - 6, 10, 0, Math.PI * 1.8); g.stroke();
      }
      g.fillStyle = bumpMode ? '#ebebeb' : '#bfa88d';
      g.beginPath(); g.ellipse(cx, cy, 16, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = bumpMode ? '#707070' : '#5a4a3d';
      g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
    }
  }
  const texFasciaColor = makeTexture(512, 128, (g, w, h) => drawCarvedFascia(g, w, h, false), 2, 1, true);
  const texFasciaBump = makeTexture(512, 128, (g, w, h) => drawCarvedFascia(g, w, h, true), 2, 1, false);

  function drawFloralStone(g, w, h, bumpMode) {
    g.fillStyle = bumpMode ? '#505050' : '#c3bfb5';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = bumpMode ? '#d4d4d4' : '#e0dcd2'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = bumpMode ? '#282828' : '#848177'; g.lineWidth = 4; g.strokeRect(22, 22, w - 44, h - 44);
    [w * 0.26, w * 0.50, w * 0.74].forEach((cx, idx) => {
      const cy = h * 0.5, rOuter = idx === 1 ? 40 : 28;
      g.fillStyle = bumpMode ? '#ececec' : '#dad6cb';
      for (let p = 0; p < 8; p++) {
        const ang = (p / 8) * Math.PI * 2;
        g.beginPath(); g.ellipse(cx + Math.cos(ang) * rOuter * 0.56, cy + Math.sin(ang) * rOuter * 0.56, rOuter * 0.36, rOuter * 0.22, ang, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = bumpMode ? '#9c9c9c' : '#9b978d';
      g.beginPath(); g.arc(cx, cy, rOuter * 0.24, 0, Math.PI * 2); g.fill();
    });
    g.strokeStyle = bumpMode ? '#dcdcdc' : '#d2cdc2'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(40, h * 0.5);
    g.bezierCurveTo(w * 0.25, h * 0.18, w * 0.4, h * 0.82, w * 0.5, h * 0.5);
    g.bezierCurveTo(w * 0.6, h * 0.18, w * 0.75, h * 0.82, w - 40, h * 0.5);
    g.stroke();
  }
  const texFloralStoneColor = makeTexture(512, 256, (g, w, h) => drawFloralStone(g, w, h, false), 1, 1, true);
  const texFloralStoneBump = makeTexture(512, 256, (g, w, h) => drawFloralStone(g, w, h, true), 1, 1, false);

  const texInkMural = makeTexture(1024, 768, (g, w, h) => {
    g.fillStyle = '#e7e2d4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = rnd() > 0.5 ? '#d4cdbd' : '#f1ede1';
      g.globalAlpha = 0.08; g.fillRect(rnd() * w, rnd() * h, 4 + rnd() * 14, 4 + rnd() * 14);
    }
    g.globalAlpha = 1;
    const pad = 34;
    g.strokeStyle = '#5a5d58'; g.lineWidth = 5;
    g.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    g.strokeRect(pad + 22, pad + 22, w - (pad + 22) * 2, h - (pad + 22) * 2);
    g.lineWidth = 3;
    for (let x = pad + 8; x < w - pad - 24; x += 26) {
      for (const y of [pad + 5, h - pad - 18]) { g.strokeRect(x, y, 14, 12); g.strokeRect(x + 4, y + 3, 6, 6); }
    }
    for (let y = pad + 26; y < h - pad - 24; y += 26) {
      for (const x of [pad + 5, w - pad - 18]) { g.strokeRect(x, y, 12, 14); g.strokeRect(x + 3, y + 4, 6, 6); }
    }
    g.save();
    g.beginPath(); g.rect(pad + 26, pad + 26, w - (pad + 26) * 2, h - (pad + 26) * 2); g.clip();
    const drawMountain = (pts, color, alpha) => {
      g.save(); g.globalAlpha = alpha; g.fillStyle = color;
      g.beginPath(); g.moveTo(pts[0][0], h); pts.forEach(([px, py]) => g.lineTo(px, py));
      g.lineTo(pts[pts.length - 1][0], h); g.closePath(); g.fill(); g.restore();
    };
    drawMountain([[50, 340], [180, 215], [310, 260], [470, 158], [640, 245], [790, 185], [970, 290]], '#989e97', 0.34);
    drawMountain([[50, 410], [210, 285], [380, 355], [560, 248], [720, 325], [880, 255], [970, 360]], '#717870', 0.40);
    const mist = g.createLinearGradient(0, 330, 0, 560);
    mist.addColorStop(0, 'rgba(235,230,217,0.74)'); mist.addColorStop(0.5, 'rgba(231,226,212,0.22)'); mist.addColorStop(1, 'rgba(220,216,204,0.65)');
    g.fillStyle = mist; g.fillRect(60, 315, w - 120, 265);
    drawMountain([[60, 560], [170, 462], [320, 508], [450, 590]], '#60665e', 0.46);
    drawMountain([[610, 610], [735, 480], [880, 440], [965, 540]], '#565d54', 0.52);
    g.fillStyle = '#676e66'; g.globalAlpha = 0.50;
    for (let k = 0; k < 4; k++) g.fillRect(462 + k * 2, 195 - k * 14, 16 - k * 4, 11);
    g.strokeStyle = '#4c524b'; g.fillStyle = '#5c635b'; g.globalAlpha = 0.68; g.lineWidth = 4;
    g.beginPath(); g.moveTo(155, 468); g.quadraticCurveTo(215, 422, 275, 468); g.closePath(); g.fill();
    g.strokeRect(182, 468, 66, 46);
    g.beginPath(); g.moveTo(205, 468); g.lineTo(205, 514); g.moveTo(228, 468); g.lineTo(228, 514); g.stroke();
    g.globalAlpha = 0.54; g.lineWidth = 5;
    g.beginPath(); g.arc(530, 585, 54, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(390, 590); g.quadraticCurveTo(420, 602, 452, 590); g.stroke();
    const drawPine = (x, y, s) => {
      g.strokeStyle = '#484e47'; g.lineWidth = 5 * s;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 14 * s, y - 55 * s, x + 8 * s, y - 110 * s); g.stroke();
      g.fillStyle = '#50594e'; g.globalAlpha = 0.48;
      for (const [dx, dy, rx, ry] of [[-24, -72, 34, 12], [20, -92, 38, 13], [-4, -116, 42, 14]]) {
        g.beginPath(); g.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 0.66;
    };
    drawPine(770, 505, 1.15); drawPine(845, 470, 0.9); drawPine(135, 510, 0.85);
    g.strokeStyle = '#7e847c'; g.globalAlpha = 0.30; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const rx = 280 + rnd() * 420, ry = 550 + rnd() * 120;
      g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + 28 + rnd() * 55, ry); g.stroke();
    }
    g.globalAlpha = 0.62; g.fillStyle = '#a03b2e'; g.fillRect(884, 108, 22, 22);
    g.restore();
  }, 1, 1, true);

  const texCaissonTop = makeTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#4a3324'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ae8c4f'; g.lineWidth = 10; g.strokeRect(24, 24, w - 48, h - 48);
    g.lineWidth = 5; g.strokeRect(48, 48, w - 96, h - 96);
    const cx = w / 2, cy = h / 2;
    g.strokeStyle = '#c4a05c'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, 118, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#60412d'; g.beginPath(); g.arc(cx, cy, 112, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#dbb670'; g.lineWidth = 6;
    for (let k = 0; k < 2; k++) {
      const a0 = k * Math.PI;
      g.beginPath(); g.arc(cx, cy, 66, a0 + 0.25, a0 + Math.PI - 0.35); g.stroke();
      g.beginPath(); g.ellipse(cx + Math.cos(a0 + 0.9) * 42, cy + Math.sin(a0 + 0.9) * 42, 34, 15, a0 + 0.5, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#bc9855';
    for (const [bx, by] of [[104, 104], [w - 104, 104], [104, h - 104], [w - 104, h - 104]]) {
      g.beginPath(); g.ellipse(bx, by, 26, 11, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fill();
    }
  }, 1, 1, true);

  function makePlaqueTex(text, bg = '#1e1915', fg = '#e4c37b', border = '#b69049') {
    return makeTexture(512, 160, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
      g.lineWidth = 3; g.strokeRect(22, 22, w - 44, h - 44);
      g.fillStyle = fg;
      g.font = '700 74px "Songti SC", "SimSun", "Noto Serif SC", serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
    }, 1, 1, true);
  }

  function makeMapLabelSprite(title, subtitle = '', accent = '#1d3c2d') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 156;
    const g = c.getContext('2d');
    g.fillStyle = accent; g.strokeStyle = '#efe6cf'; g.lineWidth = 8;
    const r = 22;
    g.beginPath();
    g.moveTo(r + 8, 8); g.lineTo(504 - r, 8); g.quadraticCurveTo(504, 8, 504, r + 8);
    g.lineTo(504, 148 - r); g.quadraticCurveTo(504, 148, 504 - r, 148);
    g.lineTo(r + 8, 148); g.quadraticCurveTo(8, 148, 8, 148 - r);
    g.lineTo(8, r + 8); g.quadraticCurveTo(8, 8, r + 8, 8);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fffdf7';
    g.font = '700 66px "Songti SC", "SimSun", "Microsoft YaHei", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, 256, subtitle ? 58 : 78);
    if (subtitle) {
      g.fillStyle = '#e4d6b5';
      g.font = '600 32px "Microsoft YaHei", sans-serif';
      g.fillText(subtitle, 256, 114);
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false, toneMapped: false }));
    sp.renderOrder = 20;
    return sp;
  }

  // ==================== 材质库（含白昼/华灯初上可调自发光材质） ====================
  const stdMat = (color, opts = {}) => new T.MeshStandardMaterial({ color, roughness: 0.9, ...opts });
  const matWood = stdMat(0x9e775a, { map: texWoodDark, bumpMap: texWoodBump, bumpScale: 0.015, roughness: 0.85 });
  const matWoodDark = stdMat(0x634633, { map: texWoodDark, bumpMap: texWoodBump, bumpScale: 0.018, roughness: 0.84 });
  const matWoodSoffit = stdMat(0x4c3424, { map: texWoodDark, roughness: 0.92, side: T.DoubleSide });
  const matWoodPale = stdMat(0xc7bba9, { map: texWoodPale, roughness: 0.92 });
  const matFascia = stdMat(0xaa9780, { map: texFasciaColor, bumpMap: texFasciaBump, bumpScale: 0.048, roughness: 0.88 });
  const matGilt = stdMat(0xba9655, { roughness: 0.52, metalness: 0.22 });
  const matVermilion = stdMat(0x8e2d21, { roughness: 0.72 });
  const matGranite = stdMat(0xcbc7bc, { map: texGranite, roughness: 0.90 });
  const matGranitePier = stdMat(0xd2cec3, { map: texGranitePier, roughness: 0.90 });
  const matGraniteDark = stdMat(0x9b988d, { map: texGranite, roughness: 0.93 });
  const matFloralStone = stdMat(0xd3cfc4, { map: texFloralStoneColor, bumpMap: texFloralStoneBump, bumpScale: 0.045, roughness: 0.90 });
  const matRock = stdMat(0x6d6c63, { roughness: 0.96 });
  const matLime = stdMat(0xf5f1e7, { map: texLimeWall, roughness: 0.94 });
  const matLimeOsm = stdMat(0xf4f0e6, { map: texLimeMeter, roughness: 0.94 });
  const matGreyBrickOsm = stdMat(0xbcc2c4, { map: texGreyBrickWall, roughness: 0.92 });
  const matNanhouOsm = stdMat(0xd8cab6, { map: texNanhouWallColor, emissive: 0xffb352, emissiveMap: texNanhouWallEmissive, emissiveIntensity: 0.14, roughness: 0.86 });
  const matRepRedOsm = stdMat(0xd8cfc7, { map: texRepRedColor, emissive: 0xffb95e, emissiveMap: texRepEmissive, emissiveIntensity: 0.12, roughness: 0.88 });
  const matRepGreyOsm = stdMat(0xd6dad8, { map: texRepGreyColor, emissive: 0xffb95e, emissiveMap: texRepEmissive, emissiveIntensity: 0.12, roughness: 0.88 });
  const matModernEdge = stdMat(0xcbc8be, { roughness: 0.95 });
  const matLimeTrim = stdMat(0x8c8c85, { roughness: 0.92 });
  const matTile = stdMat(0x666d70, { map: texClayTile, roughness: 0.86, side: T.DoubleSide });
  const matRoofRibs = stdMat(0x9ca4a8, { map: texRoofRibsColor, bumpMap: texRoofRibsBump, bumpScale: 0.055, roughness: 0.84 });
  const matTileRidge = stdMat(0x41464a, { map: texClayTile, roughness: 0.82 });
  const matWadang = stdMat(0x555c61, { roughness: 0.84 });
  const matPaperWindow = stdMat(0xe2d7bf, { roughness: 0.92, emissive: 0xffba5c, emissiveIntensity: 0.16 });
  const matInteriorDark = stdMat(0x282019, { roughness: 0.96 });
  const matMural = stdMat(0xffffff, { map: texInkMural, roughness: 0.93 });
  const matCaissonTop = stdMat(0xffffff, { map: texCaissonTop, roughness: 0.85 });
  const matLantern = stdMat(0xc63222, { roughness: 0.58, emissive: 0xe63b1c, emissiveIntensity: 0.55 });
  const matRoadHistoric = stdMat(0x9ba29c, { map: texBluestoneLane, roughness: 0.72, metalness: 0.08 });
  const matRoadAvenue = stdMat(0x6a6e70, { roughness: 0.88 });
  const matCanalWater = stdMat(0x3f6d65, { roughness: 0.18, metalness: 0.34 });
  const matLeafCard = new T.MeshStandardMaterial({ map: texLeafCluster, alphaTest: 0.36, side: T.DoubleSide, roughness: 0.88 });

  for (const [name, material, semantic] of [
    ['aged-fir', matWood, 'wood'], ['dark-fir', matWoodDark, 'wood'],
    ['eave-fir', matWoodSoffit, 'wood'], ['pale-wood', matWoodPale, 'wood'],
    ['lime-plaster', matLime, 'lime'], ['district-plaster', matLimeOsm, 'lime'],
    ['granite', matGranite, 'granite'], ['granite-pier', matGranitePier, 'granite'],
    ['granite-dark', matGraniteDark, 'granite'], ['clay-roof', matTile, 'roof'],
    ['roof-ribs', matRoofRibs, 'roof'], ['roof-ridge', matTileRidge, 'roof'],
    ['historic-paving', matRoadHistoric, 'slate'], ['carved-wood', matFascia, null],
    ['carved-stone', matFloralStone, null], ['leaf-cards', matLeafCard, null]
  ]) { material.name = name; material.userData.colabSemantic = semantic; }
  if (!globalThis.__OFFLINE_EXPORT) {
    statusEl.textContent = '正在载入细腻材质与院落模型…';
    await applyColabMaterials([
      matWood, matWoodDark, matWoodSoffit, matWoodPale, matLime, matLimeOsm,
      matGranite, matGranitePier, matGraniteDark, matTile, matRoofRibs, matTileRidge, matRoadHistoric
    ], renderer);
  }

  // ==================== 几何辅助函数 ====================
  const mkGroup = (parent = scene, name = '') => {
    const g = new T.Group();
    if (name) g.name = name;
    parent.add(g);
    return g;
  };
  function addMesh(geo, mat, x, y, z, parent = scene, cast = true, receive = true) {
    const o = new T.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = cast;
    o.receiveShadow = receive;
    parent.add(o);
    return o;
  }
  const box = (mat, x, y, z, w, h, d, p = scene, cast = true) =>
    addMesh(new T.BoxGeometry(w, h, d), mat, x, y, z, p, cast, true);
  const cyl = (mat, x, y, z, rt, rb, h, p = scene, seg = 14) =>
    addMesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, p, true, true);
  function tube(mat, pts, r, p = scene, seg = 28, radial = 8) {
    const curve = new T.CatmullRomCurve3(pts.map((q) => new T.Vector3(...q)));
    return addMesh(new T.TubeGeometry(curve, seg, r, radial, false), mat, 0, 0, 0, p, true, true);
  }
  function rod(mat, from, to, r, p = scene, seg = 7) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    const len = a.distanceTo(b);
    if (len < 1e-4) return null;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const o = addMesh(new T.CylinderGeometry(r, r, len, seg), mat, mid.x, mid.y, mid.z, p, true, true);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return o;
  }

  // ==================== 1. 1:1 全区大地坪（精确避开 6.85×8.80m 水池开孔）与约 60㎡ 水池 ====================
  const pool = A.pool;
  const siteGroup = mkGroup(scene, 'site-and-pool');

  const farGround = addMesh(new T.CircleGeometry(1300, 48), stdMat(0xc5c8ba, { roughness: 0.98 }), -60, -0.78, -90, siteGroup, false, false);
  farGround.rotation.x = -Math.PI / 2;
  // 福州乌山/于山远景淡青山形轮廓（示意）
  const hillMat = stdMat(0x9cb0a4, { roughness: 0.98 });
  for (const [hx, hz, rx, ry, rz] of [
    [-260, -680, 220, 52, 160], [60, -720, 260, 65, 180], [340, -640, 210, 48, 150],
    [-640, -140, 190, 42, 240], [520, -120, 200, 46, 240]
  ]) {
    const hill = addMesh(new T.SphereGeometry(1, 16, 10), hillMat, hx, -8, hz, siteGroup, false, false);
    hill.scale.set(rx, ry, rz);
  }

  // 覆盖整个 1:1 三坊七巷 920m × 920m 大地坪，精准绕开衣锦坊 4 号水池（x ∈ [-3.425, 3.425], z ∈ [-4.85, 3.95]）
  box(matGranite, -60, -0.36, 221.975, 940.0, 0.72, 436.05, siteGroup, false);
  box(matGraniteDark, -60, -0.36, -282.425, 940.0, 0.72, 555.15, siteGroup, false);
  box(matGranite, 206.7125, -0.36, pool.zCenter, 406.575, 0.72, pool.depth, siteGroup, false);
  box(matGranite, -266.7125, -0.36, pool.zCenter, 526.575, 0.72, pool.depth, siteGroup, false);

  // 池底与四周花岗岩池沿压顶
  box(matRock, 0, pool.floorY - 0.12, pool.zCenter, pool.width + 0.6, 0.24, pool.depth + 0.6, siteGroup, false);
  const curbH = 0.88, curbY = -0.42;
  box(matGraniteDark, -pool.width / 2 - 0.14, curbY, pool.zCenter, 0.28, curbH, pool.depth + 0.56, siteGroup);
  box(matGraniteDark, pool.width / 2 + 0.14, curbY, pool.zCenter, 0.28, curbH, pool.depth + 0.56, siteGroup);
  box(matGraniteDark, 0, curbY, pool.zMin - 0.14, pool.width + 0.56, curbH, 0.28, siteGroup);
  box(matGranite, 0, curbY, pool.zMax + 0.14, pool.width + 0.56, curbH, 0.28, siteGroup);

  const reflector = new Reflector(new T.PlaneGeometry(pool.width, pool.depth), {
    color: 0x2c4c42, textureWidth: 768, textureHeight: 768, clipBias: 0.004,
    shader: courtyardWaterShader(), multisample: 2
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, pool.y, pool.zCenter);
  scene.add(reflector);

  const waterUniforms = { clock: { value: 0 } };
  const waterMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: waterUniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float clock;
      void main() {
        vec2 p = vUv;
        float w1 = sin(125.0 * p.y + 7.5 * sin(8.0 * p.x + clock * 0.32) + clock * 0.85);
        float w2 = sin(148.0 * p.y - 52.0 * p.x - clock * 1.15);
        float glint = pow(max(0.0, w1 * 0.56 + w2 * 0.44), 10.0);
        float edge = smoothstep(0.0, 0.09, min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y)));
        vec3 baseCol = mix(vec3(0.05, 0.14, 0.12), vec3(0.11, 0.24, 0.20), edge);
        vec3 col = mix(baseCol, vec3(0.66, 0.78, 0.72), glint * 0.74);
        gl_FragColor = vec4(col, 0.035 + (1.0 - edge) * 0.05 + glint * 0.025);
      }
    `
  });
  const waterOverlay = addMesh(new T.PlaneGeometry(pool.width - 0.02, pool.depth - 0.02), waterMat, 0, pool.y + 0.008, pool.zCenter, scene, false, false);
  waterOverlay.rotation.x = -Math.PI / 2;

  const padGeo = new T.CircleGeometry(0.14, 12);
  const padMat = stdMat(0x3b633c, { roughness: 0.85, side: T.DoubleSide });
  for (const [px, pz, sc] of [[-2.4, 2.3, 1.1], [-2.15, 2.55, 0.85], [2.45, 2.1, 1.0], [2.2, 2.45, 0.78], [-2.55, 1.85, 0.7]]) {
    const pad = addMesh(padGeo, padMat, px, pool.y + 0.016, pz, siteGroup, false, true);
    pad.rotation.x = -Math.PI / 2; pad.scale.setScalar(sc);
  }
  const koiList = [];
  const koiMat = stdMat(0xd95428, { roughness: 0.45 });
  const koiGeo = new T.ConeGeometry(0.045, 0.22, 6);
  koiGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const koi = addMesh(koiGeo, koiMat, 0, pool.y - 0.06, 1.8, siteGroup, false, false);
    koiList.push({ mesh: koi, phase: i * 1.65, rx: 1.45 + i * 0.28, rz: 0.72 + (i % 2) * 0.35, cz: 2.15 + (i % 2) * 0.45, speed: 0.24 + i * 0.04 });
  }

  // ==================== 2. 衣锦坊 4 号水榭戏台核心（1:1 精建） ====================
  const stage = mkGroup(scene, 'waterside-stage');
  stage.position.set(0, 0, A.stage.z);

  const deckY = A.stage.deckY, halfS = A.stage.width / 2, colOff = 2.05;
  const tmpObj = new T.Object3D();

  for (const [cx, cz] of A.stage.columns) {
    box(matGraniteDark, cx, -0.96, cz, 0.64, 0.44, 0.64, stage);
    box(matGranitePier, cx, -0.28, cz, 0.44, 0.96, 0.44, stage);
    box(matGranite, cx, 0.22, cz, 0.56, 0.10, 0.56, stage);
    box(matGraniteDark, cx, 0.285, cz, 0.62, 0.045, 0.62, stage);
  }
  for (const cx of [-colOff, colOff]) box(matGranite, cx, 0.39, 0, 0.28, 0.18, 5.14, stage);
  for (const cz of [-colOff, colOff]) box(matGranite, 0, 0.39, cz, 5.14, 0.18, 0.28, stage);
  for (let i = -2; i <= 2; i++) box(matWoodDark, i * 0.96, 0.56, 0, 0.13, 0.14, 5.36, stage);
  box(matWoodDark, 0, 0.64, 0, A.stage.width - 0.04, 0.09, A.stage.depth - 0.04, stage);

  const plankCount = 26, plankW = (A.stage.width - 0.08) / plankCount;
  const plankInst = new T.InstancedMesh(new T.BoxGeometry(plankW - 0.008, 0.042, A.stage.depth - 0.06), matWood, plankCount);
  plankInst.name = 'stage-deck-planks'; plankInst.receiveShadow = true;
  for (let i = 0; i < plankCount; i++) {
    tmpObj.position.set(-halfS + 0.04 + (i + 0.5) * plankW, deckY - 0.015, 0);
    tmpObj.rotation.set(0, 0, 0); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
    plankInst.setMatrixAt(i, tmpObj.matrix);
    const tone = 0.86 + (i % 4 === 0 ? -0.09 : rnd() * 0.14);
    plankInst.setColorAt(i, new T.Color(tone, tone * 0.96, tone * 0.92));
  }
  stage.add(plankInst);

  function buildCarvedFasciaSide(x, z, length, rotY) {
    const g = mkGroup(stage); g.position.set(x, deckY - 0.15, z); g.rotation.y = rotY;
    box(matFascia, 0, 0, 0, length, 0.26, 0.055, g);
    box(matWoodPale, 0, 0.145, 0.015, length + 0.04, 0.045, 0.085, g);
    box(matWoodDark, 0, -0.145, 0.012, length + 0.04, 0.04, 0.075, g);
    for (let i = 0; i <= 6; i++) box(matWoodPale, -length / 2 + (i / 6) * length, 0, 0.024, 0.055, 0.27, 0.042, g);
  }
  buildCarvedFasciaSide(0, halfS, A.stage.width, 0);
  buildCarvedFasciaSide(-halfS, 0, A.stage.depth, -Math.PI / 2);
  buildCarvedFasciaSide(halfS, 0, A.stage.depth, Math.PI / 2);

  const lotusPostGeo = new T.LatheGeometry([
    new T.Vector2(0, 0), new T.Vector2(0.058, 0), new T.Vector2(0.058, 0.03),
    new T.Vector2(0.040, 0.055), new T.Vector2(0.052, 0.095), new T.Vector2(0.036, 0.135), new T.Vector2(0, 0.165)
  ], 10);
  const railH = 0.64, railEdge = halfS - 0.06, balusterMatrices = [];
  function buildWoodRailSide(x1, z1, x2, z2) {
    const a = new T.Vector3(x1, 0, z1), b = new T.Vector3(x2, 0, z2);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    for (const [ry, rh, rd] of [[0.06, 0.06, 0.07], [0.22, 0.04, 0.055], [railH, 0.062, 0.085]]) {
      const m = box(matWoodPale, mid.x, deckY + ry, mid.z, rd, rh, len, stage); m.rotation.y = ang;
    }
    for (let i = 0; i <= 3; i++) {
      const u = i / 3, px = T.MathUtils.lerp(x1, x2, u), pz = T.MathUtils.lerp(z1, z2, u);
      box(matWoodPale, px, deckY + railH / 2 + 0.03, pz, 0.095, railH + 0.08, 0.095, stage);
      addMesh(lotusPostGeo, matWoodPale, px, deckY + railH + 0.07, pz, stage);
    }
    for (let i = 1; i < 34; i++) {
      const u = i / 34;
      if (Math.abs((u * 3) - Math.round(u * 3)) < 0.065) continue;
      tmpObj.position.set(T.MathUtils.lerp(x1, x2, u), deckY + (railH + 0.08) * 0.5, T.MathUtils.lerp(z1, z2, u));
      tmpObj.rotation.set(0, ang, 0); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
      balusterMatrices.push(tmpObj.matrix.clone());
    }
  }
  buildWoodRailSide(-railEdge, railEdge, railEdge, railEdge);
  buildWoodRailSide(-railEdge, -railEdge + 0.08, -railEdge, railEdge);
  buildWoodRailSide(railEdge, -railEdge + 0.08, railEdge, railEdge);
  const woodBalusterInst = new T.InstancedMesh(new T.BoxGeometry(0.034, railH - 0.12, 0.028), matWoodPale, balusterMatrices.length);
  woodBalusterInst.name = 'stage-wood-balusters'; woodBalusterInst.castShadow = true; woodBalusterInst.receiveShadow = true;
  balusterMatrices.forEach((m, i) => woodBalusterInst.setMatrixAt(i, m));
  stage.add(woodBalusterInst);

  const eaveY = A.stage.eaveY;
  for (const [cx, cz] of A.stage.columns) {
    cyl(matGranite, cx, deckY + 0.09, cz, 0.21, 0.25, 0.18, stage, 16);
    cyl(matGraniteDark, cx, deckY + 0.20, cz, 0.17, 0.20, 0.06, stage, 16);
    const colH = eaveY - (deckY + 0.22);
    cyl(matWoodDark, cx, deckY + 0.22 + colH / 2, cz, 0.136, 0.156, colH, stage, 16);
    box(matWoodDark, cx, eaveY - 0.06, cz, 0.36, 0.14, 0.36, stage);
    box(matWood, cx, eaveY + 0.04, cz, 0.48, 0.10, 0.48, stage);
  }
  for (const cz of [-colOff, colOff]) {
    box(matWoodDark, 0, eaveY - 0.14, cz, 4.95, 0.24, 0.20, stage);
    box(matWood, 0, eaveY - 0.34, cz, 4.30, 0.10, 0.14, stage);
  }
  for (const cx of [-colOff, colOff]) {
    box(matWoodDark, cx, eaveY - 0.14, 0, 0.20, 0.24, 4.95, stage);
    box(matWood, cx, eaveY - 0.34, 0, 0.14, 0.10, 4.30, stage);
  }
  const outEave = 2.68;
  for (const cz of [-outEave, outEave]) box(matWoodDark, 0, eaveY - 0.04, cz, outEave * 2 + 0.24, 0.16, 0.15, stage);
  for (const cx of [-outEave, outEave]) box(matWoodDark, cx, eaveY - 0.04, 0, 0.15, 0.16, outEave * 2 + 0.24, stage);

  function buildArchedBeamSide(isZSide, signPos) {
    const g = mkGroup(stage);
    if (!isZSide) g.rotation.y = Math.PI / 2;
    const z = signPos * colOff;
    for (const sx of [-1, 1]) {
      tube(matWoodDark, [[sx * 2.04, eaveY - 0.72, z], [sx * 1.66, eaveY - 0.56, z], [sx * 1.24, eaveY - 0.34, z], [sx * 0.74, eaveY - 0.22, z]], 0.072, g, 20, 8);
      tube(matGilt, [[sx * 1.98, eaveY - 0.68, z + signPos * 0.074], [sx * 1.60, eaveY - 0.52, z + signPos * 0.074], [sx * 1.18, eaveY - 0.31, z + signPos * 0.074], [sx * 0.76, eaveY - 0.21, z + signPos * 0.074]], 0.017, g, 16, 6);
      for (let i = 0; i < 6; i++) {
        const bx = sx * (0.92 + i * 0.185), topY = eaveY - 0.22, botY = eaveY - 0.26 - i * 0.075;
        box(matWood, bx, (topY + botY) * 0.5, z, 0.045, topY - botY, 0.09, g);
      }
      box(matFascia, sx * 1.48, eaveY - 0.34, z, 0.68, 0.22, 0.06, g);
      tube(matWoodDark, [[sx * colOff, eaveY - 0.42, z], [sx * (colOff + 0.34), eaveY - 0.26, z + signPos * 0.32], [sx * outEave, eaveY - 0.08, z + signPos * (outEave - colOff)]], 0.068, g, 12, 7);
    }
  }
  buildArchedBeamSide(true, 1); buildArchedBeamSide(true, -1); buildArchedBeamSide(false, 1); buildArchedBeamSide(false, -1);

  const pendantGeo = new T.LatheGeometry([
    new T.Vector2(0, 0), new T.Vector2(0.025, 0.03), new T.Vector2(0.078, 0.11),
    new T.Vector2(0.095, 0.18), new T.Vector2(0.062, 0.25), new T.Vector2(0.088, 0.30),
    new T.Vector2(0.052, 0.36), new T.Vector2(0.066, 0.46), new T.Vector2(0.066, 0.62)
  ], 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const [px, pz] of [[sx * outEave, sz * (colOff + 0.12)], [sx * (colOff + 0.12), sz * outEave]]) {
        addMesh(pendantGeo, matWoodDark, px, eaveY - 0.62, pz, stage);
        cyl(matGilt, px, eaveY - 0.32, pz, 0.078, 0.078, 0.035, stage, 12);
        rod(matWood, [px, eaveY - 0.18, pz], [sx * colOff, eaveY - 0.22, sz * colOff], 0.048, stage, 6);
      }
      box(matFascia, sx * (outEave - 0.22), eaveY - 0.18, sz * (outEave - 0.22), 0.46, 0.24, 0.46, stage);
    }
  }

  const caisson = mkGroup(stage, 'three-tier-caisson');
  const tiers = [
    { half: 1.94, y: eaveY - 0.02, h: 0.16, thick: 0.14, mat: matWoodDark },
    { half: 1.46, y: eaveY + 0.16, h: 0.18, thick: 0.12, mat: matWood },
    { half: 1.00, y: eaveY + 0.34, h: 0.18, thick: 0.10, mat: matWoodDark }
  ];
  tiers.forEach((tr, idx) => {
    for (const s of [-1, 1]) {
      box(tr.mat, s * tr.half, tr.y, 0, tr.thick, tr.h, tr.half * 2 + tr.thick, caisson);
      box(tr.mat, 0, tr.y, s * tr.half, tr.half * 2 + tr.thick, tr.h, tr.thick, caisson);
      box(matGilt, s * (tr.half - tr.thick * 0.52), tr.y - tr.h * 0.34, 0, 0.024, 0.032, tr.half * 2 - tr.thick, caisson);
      box(matGilt, 0, tr.y - tr.h * 0.34, s * (tr.half - tr.thick * 0.52), tr.half * 2 - tr.thick, 0.032, 0.024, caisson);
    }
    if (idx < tiers.length - 1) {
      const next = tiers[idx + 1], span = tr.half - next.half, mid = (tr.half + next.half) * 0.5;
      for (const s of [-1, 1]) {
        box(matWoodDark, s * mid, tr.y + tr.h * 0.48, 0, span + 0.10, 0.05, tr.half * 2, caisson);
        box(matWoodDark, 0, tr.y + tr.h * 0.48, s * mid, tr.half * 2, 0.05, span + 0.10, caisson);
      }
      const inner = tr.half - tr.thick * 0.5, cut = inner - 0.44;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(matWood, [sx * inner, tr.y + 0.04, sz * cut], [sx * cut, tr.y + 0.04, sz * inner], 0.032, caisson, 6);
    }
  });
  const caissonPlate = addMesh(new T.PlaneGeometry(1.96, 1.96), matCaissonTop, 0, eaveY + 0.43, 0, caisson, false, true);
  caissonPlate.rotation.x = Math.PI / 2;

  for (const [lx, lz] of [[-1.50, 2.50], [1.50, 2.50]]) {
    rod(matWoodDark, [lx, eaveY - 0.04, lz], [lx, eaveY - 0.50, lz], 0.012, stage, 6);
    const body = addMesh(new T.SphereGeometry(0.16, 12, 10), matLantern, lx, eaveY - 0.66, lz, stage);
    body.scale.set(1.05, 0.92, 1.05);
    cyl(matGilt, lx, eaveY - 0.50, lz, 0.065, 0.065, 0.035, stage, 10);
    cyl(matGilt, lx, eaveY - 0.82, lz, 0.06, 0.06, 0.035, stage, 10);
    rod(matLantern, [lx, eaveY - 0.84, lz], [lx, eaveY - 1.02, lz], 0.016, stage, 6);
  }

  // 九脊歇山顶 + 福州大翘角 + InstancedMesh（瓦垄、瓦当/滴水、密集椽木）
  function buildXieshanRoof(parent) {
    const roofGrp = mkGroup(parent, 'stage-xieshan-roof');
    const hx = 3.44, hz = 3.36, baseY = eaveY + 0.06, rise = A.stage.ridgeRise, ridgeU = 0.48, kneeV = 0.42;
    const roofH = (x, z) => {
      const u = Math.min(1, Math.abs(x) / hx), v = Math.min(1, Math.abs(z) / hz);
      const nsDrop = 1.0 - 1.02 * v + 0.24 * Math.pow(v, 2.4);
      let ewDrop = 1.04;
      if (u > ridgeU) { const t = (u - ridgeU) / (1.0 - ridgeU); ewDrop = 0.72 * (1.0 - t) + 0.16 * Math.pow(t, 2.2) + 0.16; }
      const core = Math.min(nsDrop, ewDrop);
      const cu = Math.max(0, (u - 0.46) / 0.54), cv = Math.max(0, (v - 0.40) / 0.60);
      return baseY + rise * (core + 0.56 * Math.pow(cu * cv, 1.85) + 0.09 * Math.pow(u, 4) * (1 - 0.3 * v) + 0.08 * Math.pow(v, 4) * (1 - 0.3 * u));
    };
    const nx = 52, nz = 48, positions = [], soffitPos = [], uvs = [], indices = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx * 2 - 1) * hx, z = (j / nz * 2 - 1) * hz, y = roofH(x, z);
        positions.push(x, y, z); soffitPos.push(x, y - 0.055, z); uvs.push(i / nx * 8, j / nz * 8);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
    const roofGeo = new T.BufferGeometry();
    roofGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    roofGeo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    roofGeo.setIndex(indices); roofGeo.computeVertexNormals();
    addMesh(roofGeo, matTile, 0, 0, 0, roofGrp, true, true);
    const soffitGeo = new T.BufferGeometry();
    soffitGeo.setAttribute('position', new T.Float32BufferAttribute(soffitPos, 3));
    soffitGeo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    soffitGeo.setIndex(indices); soffitGeo.computeVertexNormals();
    addMesh(soffitGeo, matWoodSoffit, 0, 0, 0, roofGrp, false, true);

    for (const sx of [-1, 1]) {
      const gx = sx * hx * ridgeU, gTop = roofH(gx, 0), gKnee = roofH(gx, hz * kneeV);
      const gs = new T.Shape(); gs.moveTo(-hz * kneeV, gKnee - 0.04); gs.lineTo(0, gTop - 0.02); gs.lineTo(hz * kneeV, gKnee - 0.04); gs.closePath();
      const gm = addMesh(new T.ExtrudeGeometry(gs, { depth: 0.08, bevelEnabled: false }), matWoodDark, gx - sx * 0.04, 0, 0, roofGrp);
      gm.rotation.y = Math.PI / 2;
      for (const sz of [-1, 1]) rod(matWood, [gx + sx * 0.05, gTop, 0], [gx + sx * 0.05, gKnee, sz * hz * kneeV], 0.055, roofGrp, 6);
      box(matGilt, gx + sx * 0.08, gTop - 0.34, 0, 0.04, 0.34, 0.16, roofGrp);
    }

    const yAxis = new T.Vector3(0, 1, 0), tileMats = [], tileCols = [], ridgeSpacing = 0.175;
    const nColsNS = Math.floor((hx * 2 - 0.24) / ridgeSpacing);
    for (let c = 0; c <= nColsNS; c++) {
      const x = -hx + 0.12 + (c / nColsNS) * (hx * 2 - 0.24), u = Math.abs(x) / hx;
      for (const sz of [-1, 1]) {
        const zStart = u <= ridgeU ? 0.06 : hz * (0.14 + 0.26 * (u - ridgeU) / (1 - ridgeU)), step = (hz - 0.04 - zStart) / 16;
        for (let k = 0; k < 16; k++) {
          const z0 = sz * (zStart + k * step), z1 = sz * (zStart + (k + 1) * step);
          if (u > ridgeU && Math.abs((z0 + z1) * 0.5) / hz < 0.42 + (u - ridgeU) * 0.55) continue;
          const p0 = new T.Vector3(x, roofH(x, z0) + 0.036, z0), p1 = new T.Vector3(x, roofH(x, z1) + 0.036, z1);
          tmpObj.position.copy(p0).add(p1).multiplyScalar(0.5);
          tmpObj.quaternion.setFromUnitVectors(yAxis, p1.clone().sub(p0).normalize());
          tmpObj.scale.set(1, p0.distanceTo(p1) * 1.04, 1); tmpObj.updateMatrix();
          tileMats.push(tmpObj.matrix.clone()); tileCols.push(0.84 + rnd() * 0.30);
        }
      }
    }
    for (let c = 0; c <= 12; c++) {
      const z = -hz * 0.72 + (c / 12) * (hz * 1.44), v = Math.abs(z) / hz;
      for (const sx of [-1, 1]) {
        const xStart = hx * (ridgeU + 0.04), step = (hx - 0.04 - xStart) / 9;
        for (let k = 0; k < 9; k++) {
          const x0 = sx * (xStart + k * step), x1 = sx * (xStart + (k + 1) * step);
          if (v > 0.42 + (Math.abs((x0 + x1) * 0.5) / hx - ridgeU) * 1.02) continue;
          const p0 = new T.Vector3(x0, roofH(x0, z) + 0.036, z), p1 = new T.Vector3(x1, roofH(x1, z) + 0.036, z);
          tmpObj.position.copy(p0).add(p1).multiplyScalar(0.5);
          tmpObj.quaternion.setFromUnitVectors(yAxis, p1.clone().sub(p0).normalize());
          tmpObj.scale.set(1, p0.distanceTo(p1) * 1.05, 1); tmpObj.updateMatrix();
          tileMats.push(tmpObj.matrix.clone()); tileCols.push(0.84 + rnd() * 0.30);
        }
      }
    }
    const tileRidgeInst = new T.InstancedMesh(new T.CylinderGeometry(0.036, 0.040, 1.0, 6), matTileRidge, tileMats.length);
    tileRidgeInst.name = 'stage-tile-ridges'; tileRidgeInst.receiveShadow = true;
    tileMats.forEach((m, i) => { tileRidgeInst.setMatrixAt(i, m); tileRidgeInst.setColorAt(i, new T.Color().setScalar(tileCols[i])); });
    roofGrp.add(tileRidgeInst);

    const wadangMats = [], dishuiMats = [];
    for (let c = 0; c <= nColsNS; c++) {
      const x = -hx + 0.12 + (c / nColsNS) * (hx * 2 - 0.24);
      for (const sz of [-1, 1]) {
        tmpObj.position.set(x, roofH(x, sz * hz) + 0.025, sz * (hz + 0.01)); tmpObj.rotation.set(Math.PI / 2, 0, 0); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
        wadangMats.push(tmpObj.matrix.clone());
        if (c < nColsNS) {
          const xm = x + (hx * 2 - 0.24) / nColsNS * 0.5;
          tmpObj.position.set(xm, roofH(xm, sz * hz) - 0.035, sz * (hz + 0.015)); tmpObj.rotation.set(Math.PI, 0, 0); tmpObj.updateMatrix();
          dishuiMats.push(tmpObj.matrix.clone());
        }
      }
    }
    const nWadangEW = Math.floor((hz * 2 - 0.24) / ridgeSpacing);
    for (let c = 0; c <= nWadangEW; c++) {
      const z = -hz + 0.12 + (c / nWadangEW) * (hz * 2 - 0.24);
      for (const sx of [-1, 1]) {
        tmpObj.position.set(sx * (hx + 0.01), roofH(sx * hx, z) + 0.025, z); tmpObj.rotation.set(0, 0, Math.PI / 2); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
        wadangMats.push(tmpObj.matrix.clone());
      }
    }
    const wadangInst = new T.InstancedMesh(new T.CylinderGeometry(0.052, 0.052, 0.042, 10), matWadang, wadangMats.length);
    wadangInst.name = 'stage-eave-wadang'; wadangInst.receiveShadow = true;
    wadangMats.forEach((m, i) => wadangInst.setMatrixAt(i, m)); roofGrp.add(wadangInst);
    const dishuiInst = new T.InstancedMesh(new T.ConeGeometry(0.044, 0.075, 3), matTileRidge, dishuiMats.length);
    dishuiInst.name = 'stage-eave-dishui'; dishuiMats.forEach((m, i) => dishuiInst.setMatrixAt(i, m)); roofGrp.add(dishuiInst);

    const rafterMats = [];
    const pushRafter = (p0, p1) => {
      const a = new T.Vector3(...p0), b = new T.Vector3(...p1), dir = b.clone().sub(a), len = dir.length();
      if (len < 0.05) return;
      tmpObj.position.copy(a).add(b).multiplyScalar(0.5); tmpObj.quaternion.setFromUnitVectors(yAxis, dir.normalize());
      tmpObj.scale.set(1, len, 1); tmpObj.updateMatrix(); rafterMats.push(tmpObj.matrix.clone());
    };
    for (let i = 0; i <= 46; i++) { const x = -2.86 + (i / 46) * 5.72; for (const sz of [-1, 1]) pushRafter([x, roofH(x, sz * 2.04) - 0.13, sz * 2.04], [x, roofH(x, sz * (hz - 0.12)) - 0.11, sz * (hz - 0.12)]); }
    for (let i = 0; i <= 42; i++) { const z = -2.72 + (i / 42) * 5.44; for (const sx of [-1, 1]) pushRafter([sx * 2.04, roofH(sx * 2.04, z) - 0.13, z], [sx * (hx - 0.12), roofH(sx * (hx - 0.12), z) - 0.11, z]); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pivot = [sx * 2.05, eaveY - 0.02, sz * 2.05];
      for (let f = 0; f <= 8; f++) {
        const ang = (f / 8) * (Math.PI * 0.5), rx = sx * Math.min(hx - 0.08, 2.66 + Math.cos(ang) * 0.86), rz = sz * Math.min(hz - 0.08, 2.58 + Math.sin(ang) * 0.86);
        pushRafter(pivot, [rx, roofH(rx, rz) - 0.10, rz]);
      }
    }
    const rafterInst = new T.InstancedMesh(new T.CylinderGeometry(0.030, 0.033, 1.0, 6), matWood, rafterMats.length);
    rafterInst.name = 'stage-rafters'; rafterInst.receiveShadow = true;
    rafterMats.forEach((m, i) => rafterInst.setMatrixAt(i, m)); roofGrp.add(rafterInst);

    const sampleLine = (p0, p1, n = 16, yOff = 0.075) => Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n, x = T.MathUtils.lerp(p0[0], p1[0], t), z = T.MathUtils.lerp(p0[1], p1[1], t);
      return [x, roofH(x, z) + yOff, z];
    });
    tube(matTileRidge, sampleLine([-hx * ridgeU, 0], [hx * ridgeU, 0], 18, 0.11), 0.095, roofGrp, 24, 8);
    tube(matLimeTrim, sampleLine([-hx * ridgeU, 0], [hx * ridgeU, 0], 12, 0.185), 0.042, roofGrp, 18, 6);
    for (const sx of [-1, 1]) {
      const rx = sx * hx * ridgeU, ry = roofH(rx, 0) + 0.11;
      tube(matTileRidge, [[rx - sx * 0.12, ry, 0], [rx + sx * 0.08, ry + 0.09, 0], [rx + sx * 0.26, ry + 0.30, 0], [rx + sx * 0.34, ry + 0.46, 0]], 0.068, roofGrp, 16, 7);
      tube(matLimeTrim, [[rx + sx * 0.04, ry + 0.06, 0], [rx + sx * 0.24, ry + 0.28, 0], [rx + sx * 0.20, ry + 0.42, 0]], 0.032, roofGrp, 12, 6);
    }
    for (const sz of [-1, 1]) tube(matTileRidge, sampleLine([-hx, sz * hz], [hx, sz * hz], 24, 0.055), 0.062, roofGrp, 28, 7);
    for (const sx of [-1, 1]) tube(matTileRidge, sampleLine([sx * hx, -hz], [sx * hx, hz], 24, 0.055), 0.058, roofGrp, 28, 7);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ridgeEnd = [sx * hx * ridgeU, 0], knee = [sx * hx * ridgeU, sz * hz * kneeV], corner = [sx * hx, sz * hz];
      tube(matTileRidge, sampleLine(ridgeEnd, knee, 12, 0.085), 0.064, roofGrp, 16, 7);
      tube(matTileRidge, sampleLine(knee, corner, 16, 0.085), 0.070, roofGrp, 20, 7);
      const cx = corner[0], cz = corner[1], cy = roofH(cx, cz), P = (dx, dy, dz) => [cx + sx * dx, cy + dy, cz + sz * dz];
      tube(matTileRidge, [P(-0.32, 0.04, -0.30), P(0, 0.14, 0), P(0.24, 0.42, 0.22), P(0.38, 0.80, 0.34), P(0.32, 1.06, 0.29)], 0.062, roofGrp, 22, 8);
      tube(matLimeTrim, [P(-0.14, 0.10, -0.14), P(0.18, 0.38, 0.16), P(0.34, 0.78, 0.30), P(0.24, 0.96, 0.22)], 0.028, roofGrp, 18, 6);
      rod(matWoodDark, [sx * 2.05, eaveY - 0.08, sz * 2.05], P(0.14, 0.04, 0.12), 0.055, roofGrp, 7);
    }
  }
  buildXieshanRoof(stage);

  const backWallShape = new T.Shape();
  backWallShape.moveTo(-2.78, 0.36); backWallShape.lineTo(2.78, 0.36); backWallShape.lineTo(2.78, 3.92); backWallShape.lineTo(-2.78, 3.92); backWallShape.closePath();
  const archHole = new T.Path();
  archHole.moveTo(1.36, deckY); archHole.lineTo(2.22, deckY); archHole.lineTo(2.22, deckY + 1.68);
  archHole.absarc(1.79, deckY + 1.68, 0.43, 0, Math.PI, false); archHole.lineTo(1.36, deckY);
  backWallShape.holes.push(archHole);
  addMesh(new T.ExtrudeGeometry(backWallShape, { depth: 0.26, bevelEnabled: false }), matLime, 0, 0, -2.84, stage);
  box(matInteriorDark, 1.79, deckY + 1.24, -3.55, 1.55, 2.55, 1.35, stage, false);
  box(matLime, 0, 2.12, -4.25, 5.56, 3.55, 0.24, stage);
  box(matTileRidge, 0, 3.98, -3.55, 5.76, 0.16, 1.75, stage);
  addMesh(new T.PlaneGeometry(3.16, 2.22), matMural, -0.42, deckY + 1.46, -2.565, stage, false, true);

  // ==================== 3. 戏台院落围护（仅西侧福建马鞍墙+雪洞矮墙，池北连续浮雕花卉石栏） ====================
  const yardGroup = mkGroup(scene, 'courtyard-enclosure');
  function buildFujianSaddleWall(parent, pts2D, thickness, tileCap = true) {
    const curve = new T.CatmullRomCurve3(pts2D.map(([u, y]) => new T.Vector3(u, y, 0)), false, 'centripetal', 0.45);
    const sampled = curve.getPoints(64), shape = new T.Shape();
    shape.moveTo(sampled[0].x, -0.08); sampled.forEach((p) => shape.lineTo(p.x, p.y)); shape.lineTo(sampled[sampled.length - 1].x, -0.08); shape.closePath();
    addMesh(new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }), matLime, 0, 0, -thickness / 2, parent);
    const minX = sampled[0].x, maxX = sampled[sampled.length - 1].x;
    box(matGraniteDark, (minX + maxX) * 0.5, 0.14, 0, maxX - minX + 0.04, 0.34, thickness + 0.08, parent);
    if (tileCap) {
      tube(matTileRidge, sampled.map((p) => [p.x, p.y + 0.05, 0]), thickness * 0.62, parent, 56, 7);
      tube(matLimeTrim, sampled.map((p) => [p.x, p.y - 0.11, thickness * 0.52]), 0.040, parent, 44, 6);
      tube(matLimeTrim, sampled.map((p) => [p.x, p.y - 0.11, -thickness * 0.52]), 0.040, parent, 44, 6);
    }
  }

  const westSaddle = mkGroup(yardGroup, 'west-fujian-saddle-wall');
  westSaddle.position.set(A.westWalls.saddleWallX, 0, -0.35); westSaddle.rotation.y = Math.PI / 2;
  buildFujianSaddleWall(westSaddle, [[-6.0, 3.65], [-4.4, 4.20], [-2.7, 5.85], [-1.4, 6.32], [-0.1, 5.20], [1.4, 3.95], [3.1, 3.38], [4.6, 3.65], [6.0, 4.18]], 0.34, true);

  const westLow = mkGroup(yardGroup, 'west-snow-cave-low-wall');
  westLow.position.set(A.westWalls.lowWallX, 0, 0.05); westLow.rotation.y = Math.PI / 2;
  const lwShape = new T.Shape();
  lwShape.moveTo(-4.0, 0.0); lwShape.lineTo(4.0, 0.0); lwShape.lineTo(4.0, 1.56); lwShape.quadraticCurveTo(0, 1.66, -4.0, 1.58); lwShape.closePath();
  const c1 = new T.Path(); c1.moveTo(-0.35, 0.44); c1.lineTo(0.24, 0.46); c1.lineTo(0.46, 0.92); c1.lineTo(0.08, 1.18); c1.lineTo(-0.38, 1.02); c1.closePath(); lwShape.holes.push(c1);
  const c2 = new T.Path(); c2.absellipse(1.65, 0.78, 0.34, 0.40, 0, Math.PI * 2, false, 0); lwShape.holes.push(c2);
  const c3 = new T.Path(); c3.moveTo(-2.15, 0.50); c3.lineTo(-1.42, 0.50); c3.lineTo(-1.32, 0.94); c3.quadraticCurveTo(-1.78, 1.24, -2.24, 0.94); c3.closePath(); lwShape.holes.push(c3);
  addMesh(new T.ExtrudeGeometry(lwShape, { depth: 0.24, bevelEnabled: false }), matLime, 0, 0, -0.12, westLow);
  box(matTileRidge, 0, 1.66, 0, 8.15, 0.11, 0.42, westLow);
  box(matLimeTrim, 0, 1.56, 0.14, 8.10, 0.05, 0.06, westLow);
  box(matInteriorDark, 0, 0.85, -0.68, 7.0, 1.55, 0.12, westLow, false);

  box(matLime, -5.85, 1.48, -0.25, 0.28, 2.96, 12.2, yardGroup);
  box(matTileRidge, -5.85, 3.00, -0.25, 0.44, 0.12, 12.3, yardGroup);
  box(matGraniteDark, -5.85, 0.16, -0.25, 0.36, 0.34, 12.2, yardGroup);

  const northRail = mkGroup(yardGroup, 'north-floral-stone-balustrade');
  const nrZ = A.balustradeNorth.z, nrW = A.balustradeNorth.width, nrBays = A.balustradeNorth.bays, nrBayW = nrW / nrBays, nrH = A.balustradeNorth.height;
  box(matGraniteDark, 0, 0.07, nrZ, nrW + 0.16, 0.14, 0.24, northRail);
  box(matGranite, 0, nrH - 0.045, nrZ, nrW + 0.14, 0.09, 0.26, northRail);
  const stoneFinialGeo = new T.LatheGeometry([
    new T.Vector2(0, 0), new T.Vector2(0.080, 0), new T.Vector2(0.070, 0.028),
    new T.Vector2(0.088, 0.070), new T.Vector2(0.062, 0.115), new T.Vector2(0, 0.145)
  ], 10);
  for (let i = 0; i <= nrBays; i++) {
    const px = -nrW / 2 + i * nrBayW;
    box(matGranite, px, nrH * 0.5 + 0.015, nrZ, 0.17, nrH + 0.03, 0.22, northRail);
    box(matGraniteDark, px, nrH + 0.05, nrZ, 0.21, 0.055, 0.25, northRail);
    addMesh(stoneFinialGeo, matGranite, px, nrH + 0.075, nrZ, northRail);
  }
  for (let i = 0; i < nrBays; i++) {
    const bx = -nrW / 2 + (i + 0.5) * nrBayW, panelW = nrBayW - 0.17;
    box(matFloralStone, bx, 0.34, nrZ, panelW, 0.38, 0.13, northRail);
    box(matGraniteDark, bx, 0.51, nrZ, panelW, 0.032, 0.16, northRail);
    box(matGraniteDark, bx, 0.17, nrZ, panelW, 0.032, 0.16, northRail);
  }

  // ==================== 4. 对岸双层前廊后堂花厅 + 12 扇朝南木格门窗 ====================
  const hall = mkGroup(scene, 'two-story-flower-hall');
  const hZ0 = A.hall.z, hVerZ = A.hall.verandaFrontZ, hFacZ = A.hall.facadeZ, hRearZ = A.hall.rearZ, hW = A.hall.width;
  const floor1Y = 0.18, floor2Y = 3.52;
  box(matGranite, 0, floor1Y * 0.5, (hZ0 + hRearZ) * 0.5, hW, floor1Y, hRearZ - hZ0, hall);
  box(matGranite, 0, 0.06, hZ0 - 0.14, 3.2, 0.12, 0.28, hall);
  const hallColX = [-4.35, -1.85, 1.85, 4.35];
  for (const cx of hallColX) {
    cyl(matGranite, cx, floor1Y + 0.10, hVerZ, 0.19, 0.22, 0.20, hall, 14);
    cyl(matWoodDark, cx, floor1Y + 0.20 + 1.56, hVerZ, 0.135, 0.15, 3.12, hall, 14);
    for (const s of [-1, 1]) {
      if ((cx === -4.35 && s < 0) || (cx === 4.35 && s > 0)) continue;
      box(matFascia, cx + s * 0.36, floor2Y - 0.34, hVerZ, 0.56, 0.22, 0.08, hall);
    }
    box(matWoodDark, cx, floor2Y - 0.16, (hVerZ + hFacZ) * 0.5, 0.16, 0.22, hFacZ - hVerZ, hall);
  }
  box(matWoodDark, 0, floor2Y - 0.12, hVerZ, hW - 0.3, 0.24, 0.18, hall);
  box(matWood, 0, floor2Y - 0.04, (hZ0 + hFacZ) * 0.5, hW - 0.1, 0.12, hFacZ - hZ0, hall);
  const eave1Slope = addMesh(new T.BoxGeometry(hW + 0.45, 0.10, 0.72), matRoofRibs, 0, floor2Y - 0.10, hZ0 - 0.22, hall);
  eave1Slope.rotation.x = 0.28;
  box(matTileRidge, 0, floor2Y - 0.18, hZ0 - 0.54, hW + 0.48, 0.08, 0.08, hall);
  for (const bx of [-3.10, 3.10]) {
    box(matWoodDark, bx, floor1Y + 0.44, hVerZ + 0.70, 1.75, 0.08, 0.44, hall);
    for (const dx of [-0.66, 0.66]) box(matWood, bx + dx, floor1Y + 0.22, hVerZ + 0.70, 0.09, 0.42, 0.34, hall);
  }

  const hallMuntinMats = [], hallFrameMats = [], hallPaperMats = [];
  function buildSouthLatticeLeaf(cx, w, h, baseY, zPos, ajarAngle = 0) {
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, ajarAngle, 0));
    const leafMat = new T.Matrix4().compose(new T.Vector3(cx, baseY, zPos), q, new T.Vector3(1, 1, 1));
    const pushBox = (arr, lx, ly, lz, sx, sy, sz) => arr.push(leafMat.clone().multiply(new T.Matrix4().compose(new T.Vector3(lx, ly, lz), new T.Quaternion(), new T.Vector3(sx, sy, sz))));
    pushBox(hallFrameMats, -w / 2 + 0.028, h / 2, 0, 0.055, h, 0.055);
    pushBox(hallFrameMats, w / 2 - 0.028, h / 2, 0, 0.055, h, 0.055);
    pushBox(hallFrameMats, 0, h - 0.032, 0, w, 0.064, 0.055);
    pushBox(hallFrameMats, 0, 0.032, 0, w, 0.064, 0.055);
    const skirtH = h * 0.34, gridH = h - skirtH - 0.14, gridY0 = skirtH + 0.08;
    pushBox(hallMuntinMats, 0, skirtH * 0.5 + 0.04, 0, w - 0.09, skirtH - 0.04, 0.032);
    pushBox(hallFrameMats, 0, skirtH + 0.05, 0, w - 0.04, 0.055, 0.055);
    pushBox(hallPaperMats, 0, gridY0 + gridH * 0.5, 0.012, w - 0.10, gridH, 0.012);
    for (let i = 1; i < 3; i++) pushBox(hallMuntinMats, -w / 2 + 0.05 + (i / 3) * (w - 0.10), gridY0 + gridH * 0.5, -0.018, 0.022, gridH, 0.024);
    for (let j = 1; j < 6; j++) pushBox(hallMuntinMats, 0, gridY0 + (j / 6) * gridH, -0.018, w - 0.10, 0.022, 0.024);
  }
  const doorH = 2.78;
  for (const px of [-4.60, -1.85, 1.85, 4.60]) box(matWoodDark, px, floor1Y + 1.66, hFacZ, 0.24, 3.32, 0.24, hall);
  box(matWoodDark, 0, floor1Y + doorH + 0.28, hFacZ, hW - 0.4, 0.56, 0.18, hall);
  for (let i = 0; i < 4; i++) buildSouthLatticeLeaf(-4.15 + i * 0.61, 0.58, doorH, floor1Y, hFacZ);
  for (let i = 0; i < 4; i++) buildSouthLatticeLeaf(-1.26 + i * 0.84, 0.80, doorH, floor1Y, hFacZ, i === 1 ? -0.18 : i === 2 ? 0.18 : 0);
  for (let i = 0; i < 4; i++) buildSouthLatticeLeaf(2.32 + i * 0.61, 0.58, doorH, floor1Y, hFacZ);
  box(matInteriorDark, 0, floor1Y + 1.65, hRearZ - 0.20, hW - 0.6, 3.30, 0.24, hall, false);
  box(matLime, -hW / 2 + 0.14, floor1Y + 3.0, (hZ0 + hRearZ) * 0.5, 0.28, 6.2, hRearZ - hZ0, hall);
  box(matLime, hW / 2 - 0.14, floor1Y + 3.0, (hZ0 + hRearZ) * 0.5, 0.28, 6.2, hRearZ - hZ0, hall);

  const roof2Y = 6.22;
  box(matWoodDark, 0, floor2Y, (hVerZ + hRearZ) * 0.5, hW - 0.3, 0.18, hRearZ - hVerZ + 0.1, hall);
  box(matWoodDark, 0, floor2Y + 0.78, hVerZ + 0.02, hW - 0.7, 0.08, 0.09, hall);
  box(matWoodDark, 0, floor2Y + 0.12, hVerZ + 0.02, hW - 0.7, 0.07, 0.08, hall);
  for (let i = 0; i < 36; i++) hallMuntinMats.push(new T.Matrix4().compose(new T.Vector3(-4.25 + (i / 35) * 8.50, floor2Y + 0.45, hVerZ + 0.02), new T.Quaternion(), new T.Vector3(0.036, 0.64, 0.036)));
  for (const cx of hallColX) cyl(matWoodDark, cx, floor2Y + 1.35, hVerZ, 0.12, 0.13, 2.70, hall, 12);
  box(matWoodDark, 0, roof2Y - 0.10, hVerZ, hW - 0.2, 0.22, 0.18, hall);
  box(matWoodDark, 0, floor2Y + 0.45, hFacZ - 0.05, hW - 0.6, 0.90, 0.16, hall);
  for (let i = 0; i < 8; i++) buildSouthLatticeLeaf(-3.78 + i * 1.08, 0.94, 1.68, floor2Y + 0.90, hFacZ - 0.05);
  box(matLime, 0, floor2Y + 1.38, hRearZ - 0.12, hW, 2.85, 0.28, hall);

  const unitBoxGeo = new T.BoxGeometry(1, 1, 1);
  const addInstBatch = (name, mat, matrices, parent = scene, cast = false) => {
    if (!matrices.length) return;
    const inst = new T.InstancedMesh(unitBoxGeo, mat, matrices.length);
    inst.name = name; inst.castShadow = cast; inst.receiveShadow = true;
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    parent.add(inst);
  };
  addInstBatch('hall-lattice-frames', matWoodDark, hallFrameMats, hall);
  addInstBatch('hall-lattice-muntins', matWood, hallMuntinMats, hall);
  addInstBatch('hall-lattice-paper', matPaperWindow, hallPaperMats, hall);

  const hallSlopeLen = Math.hypot((hRearZ - hVerZ + 1.15) * 0.5, 1.58);
  const hallAngle = Math.atan2(1.58, (hRearZ - hVerZ + 1.15) * 0.5);
  for (const sz of [-1, 1]) {
    const p = addMesh(new T.BoxGeometry(hW + 0.35, 0.10, hallSlopeLen + 0.24), matRoofRibs, 0, roof2Y + 0.79, (hVerZ + hRearZ) * 0.5 - 0.15 + sz * (hRearZ - hVerZ + 1.15) * 0.25, hall);
    p.rotation.x = sz * hallAngle;
  }
  box(matTileRidge, 0, roof2Y + 1.66, (hVerZ + hRearZ) * 0.5 - 0.15, hW + 0.45, 0.18, 0.18, hall);
  for (const sx of [-1, 1]) {
    const gableWall = mkGroup(hall);
    gableWall.position.set(sx * (hW * 0.5 + 0.02), 0, (hVerZ + hRearZ) * 0.5 - 0.15);
    gableWall.rotation.y = Math.PI / 2;
    buildFujianSaddleWall(gableWall, [[-3.05, 6.20], [-2.05, 6.72], [0.00, 8.08], [2.05, 6.72], [3.05, 6.20]], 0.30, true);
  }

  // ==================== 5. 精细叶片树冠系统与假山叠石 ====================
  const leafCardMats = [], leafCardCols = [], trunkMats = [], rockMatsDark = [], rockMatsLight = [];
  function pushCrag(x, y, z, sx, sy, sz) {
    const q = new T.Quaternion().setFromEuler(new T.Euler(rnd() * 0.8, rnd() * 6.28, rnd() * 0.7));
    (rnd() > 0.52 ? rockMatsLight : rockMatsDark).push(new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(sx, sy, sz)));
  }
  for (let i = 0; i < 18; i++) pushCrag(3.38 + rnd() * 0.52, -0.08 + rnd() * 0.56, -3.7 + (i / 17) * 7.2 + (rnd() - 0.5) * 0.35, 0.28 + rnd() * 0.42, 0.26 + rnd() * 0.44, 0.32 + rnd() * 0.45);
  for (let i = 0; i < 14; i++) pushCrag(-3.65 - rnd() * 0.95, 0.02 + rnd() * 0.58, -4.2 + (i / 13) * 6.5 + (rnd() - 0.5) * 0.4, 0.30 + rnd() * 0.48, 0.28 + rnd() * 0.46, 0.34 + rnd() * 0.48);

  function pushLeafTuft(x, y, z, size, tint = 1.0) {
    const yaw = rnd() * Math.PI, tilt = (rnd() - 0.5) * 0.55;
    for (let k = 0; k < 2; k++) {
      const q = new T.Quaternion().setFromEuler(new T.Euler(tilt, yaw + k * (Math.PI * 0.5), (rnd() - 0.5) * 0.4));
      leafCardMats.push(new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(size, size * 0.88, size)));
      const gVar = tint * (0.86 + rnd() * 0.28);
      leafCardCols.push(new T.Color(gVar * 0.96, gVar, gVar * 0.92));
    }
  }
  function pushTrunkSeg(a, b, r) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b), dir = vb.clone().sub(va), len = dir.length();
    if (len < 0.05) return;
    trunkMats.push(new T.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()), new T.Vector3(r, len, r)));
  }
  const heartTreeControllers = [];
  let heartTreePose = A.heartTreeView;
  function addBotanicalTree(x, y, z, h, spread, style = 'tree') {
    if (style === 'heart-banyan') {
      const tree = createHeartBanyan();
      tree.object.position.set(x, y, z);
      scene.add(tree.object);
      heartTreeControllers.push(tree);
      heartTreePose = [x + .2, y + 2.5, z + 15.8, x, y + 5.2, z];
      return;
    }
    if (style === 'banyan') {
      pushTrunkSeg([x, y, z], [x + 0.2, y + h * 0.58, z - 0.1], 0.44);
      for (let b = 0; b < 5; b++) {
        const a = b * 1.256 + rnd() * 0.35, bx = x + Math.cos(a) * spread * 0.56, bz = z + Math.sin(a) * spread * 0.56, by = y + h * (0.76 + rnd() * 0.14);
        pushTrunkSeg([x + 0.1, y + h * 0.48, z], [bx, by, bz], 0.15);
        pushTrunkSeg([(x + bx) * 0.5, by - 0.15, (z + bz) * 0.5], [(x + bx) * 0.5, y + 0.55, (z + bz) * 0.5], 0.022);
      }
      for (let i = 0; i < 28; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread, dome = Math.cos((d / spread) * Math.PI * 0.44);
        pushLeafTuft(x + Math.cos(a) * d, y + h * (0.68 + dome * 0.36) + (rnd() - 0.5) * 0.5, z + Math.sin(a) * d, 1.65 + rnd() * 0.90, 0.96);
      }
      return;
    }
    if (style === 'tree') {
      pushTrunkSeg([x, y, z], [x + 0.18, y + h * 0.72, z - 0.12], 0.14);
      for (let b = 0; b < 4; b++) {
        const a = b * 1.57 + rnd() * 0.4;
        pushTrunkSeg([x + 0.10, y + h * 0.48, z], [x + Math.cos(a) * spread * 0.55, y + h * (0.78 + rnd() * 0.16), z + Math.sin(a) * spread * 0.55], 0.055);
      }
    }
    const tufts = style === 'tree' ? 18 : 11;
    for (let i = 0; i < tufts; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread;
      pushLeafTuft(x + Math.cos(a) * d, y + h * (0.62 + rnd() * 0.46), z + Math.sin(a) * d, (style === 'tree' ? 0.98 : 0.62) + rnd() * 0.45, 0.98);
    }
  }

  addBotanicalTree(-4.55, 0.10, 0.15, 0.78, 1.05, 'shrub');
  addBotanicalTree(-4.85, 0.10, -2.55, 2.75, 1.50, 'tree');
  addBotanicalTree(-5.15, 0.10, -4.85, 3.55, 1.80, 'tree');
  addBotanicalTree(4.15, 0.18, -2.55, 2.35, 1.10, 'tree');
  addBotanicalTree(4.05, 0.14, 2.65, 0.76, 0.74, 'shrub');

  // ==================== 6. 基于 1:1 真实 OpenStreetMap 矢量数据的完整三坊七巷街区 ====================
  const districtGrp = mkGroup(scene, 'sanfang-qixiang-osm-district');
  const mapLabelsGroup = mkGroup(scene, 'district-wayfinding-labels');
  mapLabelsGroup.visible = false;

  // 传统四柱三间牌坊构造器（按真实交口与朝向安放）
  function buildPaifang(x, z, rotY, title, scale = 1.0) {
    const pf = mkGroup(districtGrp, 'paifang-' + title);
    pf.position.set(x, 0, z);
    pf.rotation.y = rotY;
    pf.scale.setScalar(scale);
    [-3.1, -1.35, 1.35, 3.1].forEach((cx, idx) => {
      const h = (idx === 1 || idx === 2) ? 5.65 : 4.45;
      box(matGranite, cx, 0.45, 0, 0.52, 0.90, 0.72, pf);
      cyl(matVermilion, cx, 0.90 + (h - 0.90) * 0.5, 0, 0.16, 0.18, h - 0.90, pf, 10);
    });
    box(matWoodDark, 0, 4.35, 0, 6.7, 0.36, 0.34, pf);
    box(matWoodDark, 0, 5.45, 0, 3.25, 0.34, 0.32, pf);
    box(matGilt, 0, 4.90, 0, 2.75, 0.16, 0.28, pf);
    const pMat = stdMat(0xffffff, { map: makePlaqueTex(title), roughness: 0.65 });
    box(pMat, 0, 4.92, 0.19, 2.25, 0.72, 0.06, pf);
    box(pMat, 0, 4.92, -0.19, 2.25, 0.72, 0.06, pf);
    const addArchRoof = (rx, ry, rw, rd) => {
      for (const sz of [-1, 1]) {
        const sl = addMesh(new T.BoxGeometry(rw, 0.12, rd * 0.72), matRoofRibs, rx, ry + 0.32, sz * rd * 0.30, pf);
        sl.rotation.x = sz * 0.48;
      }
      box(matTileRidge, rx, ry + 0.66, 0, rw + 0.35, 0.18, 0.20, pf);
      for (const sx of [-1, 1]) rod(matTileRidge, [rx + sx * (rw * 0.5), ry + 0.64, 0], [rx + sx * (rw * 0.5 + 0.32), ry + 0.96, 0], 0.065, pf, 6);
    };
    addArchRoof(0, 5.65, 3.85, 1.55);
    addArchRoof(-2.35, 4.48, 2.15, 1.25);
    addArchRoof(2.35, 4.48, 2.15, 1.25);
  }

  // 生成道路/河道带状几何体
  function buildRibbonGeo(pts, halfW, yLevel, uvScale = 0.22) {
    if (pts.length < 2) return null;
    const pos = [], norm = [], uvs = [];
    let accLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      // 跳过落入水榭戏台水池内部的极短路段
      const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
      if (Math.abs(mx) < 4.5 && mz > -6.0 && mz < 5.0) continue;
      const nx = (-dz / len) * halfW, nz = (dx / len) * halfW;
      const u0 = accLen * uvScale, u1 = (accLen + len) * uvScale;
      accLen += len;
      const ax = x0 + nx, az = z0 + nz, bx = x0 - nx, bz = z0 - nz;
      const cx = x1 + nx, cz = z1 + nz, dxp = x1 - nx, dzp = z1 - nz;
      pos.push(ax, yLevel, az, bx, yLevel, bz, cx, yLevel, cz, bx, yLevel, bz, dxp, yLevel, dzp, cx, yLevel, cz);
      for (let k = 0; k < 6; k++) norm.push(0, 1, 0);
      uvs.push(u0, 0, u0, 1, u1, 0, u0, 1, u1, 1, u1, 0);
    }
    if (!pos.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(norm, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    return g;
  }

  // 三种不同风格的平滑「福建曲线马鞍墙」单位几何体（0:尖峰马鞍 1:缓弧双肩 2:三叠曲线，无徽派马头墙）
  function makeSaddleVariant(pts2D) {
    const curve = new T.CatmullRomCurve3(pts2D.map(([u, v]) => new T.Vector3(u, v, 0)), false, 'centripetal', 0.45);
    const sampled = curve.getPoints(28);
    const shape = new T.Shape();
    shape.moveTo(-0.50, -0.35);
    sampled.forEach((p) => shape.lineTo(p.x, p.y));
    shape.lineTo(0.50, -0.35);
    shape.closePath();
    const wallGeo = new T.ExtrudeGeometry(shape, { depth: 0.30, bevelEnabled: false });
    wallGeo.translate(0, 0, -0.15);
    const capGeo = new T.TubeGeometry(new T.CatmullRomCurve3(sampled.map((p) => new T.Vector3(p.x, p.y + 0.035, 0))), 26, 0.11, 6, false);
    return { wallGeo, capGeo };
  }
  const saddleVariants = [
    makeSaddleVariant([[-0.50, 0.0], [-0.44, 0.18], [-0.24, 0.58], [0.0, 1.05], [0.24, 0.58], [0.44, 0.18], [0.50, 0.0]]),
    makeSaddleVariant([[-0.50, 0.08], [-0.36, 0.42], [-0.16, 0.68], [0.0, 0.88], [0.16, 0.68], [0.36, 0.42], [0.50, 0.08]]),
    makeSaddleVariant([[-0.50, 0.04], [-0.40, 0.36], [-0.28, 0.28], [-0.14, 0.72], [0.0, 1.02], [0.14, 0.72], [0.28, 0.28], [0.40, 0.36], [0.50, 0.04]])
  ];

  const lanternMats = [];
  const dRoofSlopeMats = [], dRoofRidgeMats = [], dParapetMats = [], dArcadeWoodMats = [], dBannerMats = [];
  const saddleMatsByVar = [[], [], []];

  if (osmData) {
    // 6.1 渲染全部 86 条真实 OSM 曲折道路与真实安泰河水系
    const histRoadGeos = [], aveRoadGeos = [], waterGeos = [];
    for (const r of osmData.roads) {
      const yLv = r.kind === 'nanhou' ? 0.028 : r.kind === 'historic_lane' ? 0.022 : 0.016;
      const g = buildRibbonGeo(r.pts, r.width * 0.5, yLv, r.kind === 'avenue' ? 0.10 : 0.24);
      if (g) (r.kind === 'avenue' ? aveRoadGeos : histRoadGeos).push(g);

      // 沿真实南后街与三坊七巷曲线布置红灯笼串与行道古榕
      if (r.kind === 'nanhou' || r.kind === 'historic_lane') {
        const spacing = r.kind === 'nanhou' ? 14.0 : 28.0;
        const sideOff = r.width * 0.5 + 0.45;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
          const len = Math.hypot(x1 - x0, z1 - z0);
          if (len < 6.0) continue;
          const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
          const steps = Math.max(1, Math.floor(len / spacing));
          for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) / steps;
            const px = T.MathUtils.lerp(x0, x1, t), pz = T.MathUtils.lerp(z0, z1, t);
            if (Math.abs(px) < 9.0 && pz > -10.0 && pz < 15.0) continue;
            for (const side of (r.kind === 'nanhou' ? [-1, 1] : [1])) {
              lanternMats.push(new T.Matrix4().compose(
                new T.Vector3(px + nx * side * sideOff, 3.35, pz + nz * side * sideOff),
                new T.Quaternion(),
                new T.Vector3(0.24, 0.28, 0.24)
              ));
            }
            if (r.kind === 'nanhou' && s % 3 === 1 && rnd() > 0.38) {
              addBotanicalTree(px + nx * (rnd() > 0.5 ? 1 : -1) * (sideOff + 0.8), 0, pz + nz * (sideOff + 0.8), 5.6 + rnd() * 1.4, 3.0 + rnd() * 0.9, 'banyan');
            }
          }
        }
      }
    }
    const mergedHistRoads = mergeGeoList(histRoadGeos);
    if (mergedHistRoads) addMesh(mergedHistRoads, matRoadHistoric, 0, 0, 0, districtGrp, false, true);
    const mergedAveRoads = mergeGeoList(aveRoadGeos);
    if (mergedAveRoads) addMesh(mergedAveRoads, matRoadAvenue, 0, 0, 0, districtGrp, false, true);

    for (const w of osmData.waters) {
      if (w.kind === 'pond' && w.pts.length >= 4) {
        const sh = new T.Shape();
        sh.moveTo(w.pts[0][0], -w.pts[0][1]);
        for (let i = 1; i < w.pts.length; i++) sh.lineTo(w.pts[i][0], -w.pts[i][1]);
        sh.closePath();
        const g = new T.ShapeGeometry(sh);
        g.rotateX(-Math.PI / 2);
        g.translate(0, -0.10, 0);
        waterGeos.push(g);
      } else {
        const g = buildRibbonGeo(w.pts, w.width * 0.5, -0.12, 0.1);
        if (g) waterGeos.push(g);
        // 安泰河畔点景绿树
        for (let i = 0; i < w.pts.length - 1; i += 2) {
          const [wx, wz] = w.pts[i];
          if (wx > -410 && wx < 310 && wz > -450 && wz < 280) {
            addBotanicalTree(wx, 0, wz + 6.5, 4.8 + rnd() * 1.4, 2.8, 'tree');
          }
        }
      }
    }
    const mergedWaters = mergeGeoList(waterGeos);
    if (mergedWaters) addMesh(mergedWaters, matCanalWater, 0, 0, 0, districtGrp, false, true);

    // 6.2 渲染全部 682 栋 1:1 真实 OSM 多边形建筑（按 6 类福州建筑风格合并几何体）
    const wallBuckets = {
      min_mansion: [],
      min_greybrick: [],
      nanhou_arcade: [],
      republican_red: [],
      republican_grey: [],
      temple: [],
      modern_edge: []
    };
    const plinthGeos = [];
    const flatTileCapGeos = [];

    for (const b of osmData.buildings) {
      if (!b.pts || b.pts.length < 3) continue;
      const shape = new T.Shape();
      shape.moveTo(b.pts[0][0], -b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) shape.lineTo(b.pts[i][0], -b.pts[i][1]);
      shape.closePath();

      // 真实多边形外墙拉伸（(px, -pz, h) 经 rotateX(-PI/2) 精确映射至世界坐标 (px, h, pz)）
      const extGeo = new T.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
      extGeo.rotateX(-Math.PI / 2);
      const bucket = wallBuckets[b.style] || wallBuckets.min_mansion;
      bucket.push(extGeo);

      if (b.style !== 'modern_edge') {
        const plGeo = new T.ExtrudeGeometry(shape, { depth: 0.52, bevelEnabled: false });
        plGeo.rotateX(-Math.PI / 2);
        plinthGeos.push(plGeo);
      }

      // 屋顶与山墙装潢（根据多边形与 OBB 贴合度自适应处理，杜绝屋顶横跨天井！）
      const fillRatio = b.area / Math.max(1.0, b.len * b.wid);
      const rotY = -b.ang;
      const baseMat = new T.Matrix4().compose(
        new T.Vector3(b.cx, b.h, b.cz),
        new T.Quaternion().setFromEuler(new T.Euler(0, rotY, 0)),
        new T.Vector3(1, 1, 1)
      );
      const pushLocal = (arr, lx, ly, lz, rx, ry, rz, sx, sy, sz) => {
        arr.push(baseMat.clone().multiply(new T.Matrix4().compose(
          new T.Vector3(lx, ly, lz),
          new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)),
          new T.Vector3(sx, sy, sz)
        )));
      };

      if (b.style === 'modern_edge') continue;

      if (fillRatio >= 0.52 && b.wid <= 24.0 && b.len <= 55.0) {
        // 标准长条/合院厅堂：精确沿真实 OBB 屋脊方向生成青瓦双坡屋顶
        const halfD = b.wid * 0.5 + 0.35;
        const ridgeH = Math.min(3.2, Math.max(1.15, b.wid * 0.22));
        const slopeLen = Math.hypot(halfD, ridgeH);
        const slopeAng = Math.atan2(ridgeH, halfD);
        for (const sz of [-1, 1]) {
          pushLocal(dRoofSlopeMats, 0, ridgeH * 0.5, sz * halfD * 0.5, sz * slopeAng, 0, 0, b.len + 0.35, 0.12, slopeLen + 0.18);
          pushLocal(dRoofRidgeMats, 0, 0.04, sz * (halfD + 0.05), 0, 0, 0, b.len + 0.40, 0.09, 0.10);
        }
        pushLocal(dRoofRidgeMats, 0, ridgeH + 0.08, 0, 0, 0, 0, b.len + 0.42, 0.18, 0.18);

        if (b.style === 'republican_red' || b.style === 'republican_grey') {
          // 民国中西合璧洋楼：白色灰塑女儿墙与中央巴洛克山花饰顶
          for (const sz of [-1, 1]) {
            pushLocal(dParapetMats, 0, 0.55, sz * (b.wid * 0.5 + 0.06), 0, 0, 0, b.len + 0.18, 0.95, 0.24);
            pushLocal(dParapetMats, 0, 1.32, sz * (b.wid * 0.5 + 0.06), 0, 0, 0, Math.min(4.2, b.len * 0.36), 0.72, 0.28);
          }
        } else {
          // 闽派明清大厝 / 南后街木构骑楼：山墙两端平滑弧线「福建马鞍墙」（3 种变体随机错落）
          const sv = b.sv % 3;
          const swDepth = b.wid + 0.72;
          const swPeak = ridgeH + 0.52;
          for (const sx of [-1, 1]) {
            pushLocal(saddleMatsByVar[sv], sx * (b.len * 0.5 + 0.02), 0, 0, 0, Math.PI / 2, 0, swDepth, swPeak, 1.0);
          }
          // 南后街木构骑楼补加一层挑檐披水、木柱与红底竖幅招幌
          if (b.style === 'nanhou_arcade') {
            for (const sz of [-1, 1]) {
              pushLocal(dRoofSlopeMats, 0, -b.h + 3.42, sz * (b.wid * 0.5 + 0.55), -sz * 0.28, 0, 0, b.len + 0.15, 0.09, 1.15);
              pushLocal(dArcadeWoodMats, 0, -b.h + 3.22, sz * (b.wid * 0.5 + 0.50), 0, 0, 0, b.len, 0.20, 0.20);
            }
            if (rnd() > 0.35) {
              pushLocal(dBannerMats, (rnd() - 0.5) * b.len * 0.4, -b.h + 2.65, (b.wid * 0.5 + 0.95) * (rnd() > 0.5 ? 1 : -1), 0, 0, 0, 0.06, 1.15, 0.40);
            }
          }
        }
      } else {
        // 大型回字/L型复杂合院：保留真实多边形青瓦平坡屋顶帽，严守院落天井开孔不遮挡
        const capGeo = new T.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1 });
        capGeo.rotateX(-Math.PI / 2);
        capGeo.translate(0, b.h, 0);
        flatTileCapGeos.push(capGeo);
      }
    }

    // 提交合并后的 1:1 真实建筑多边形网格（仅 7 个 Draw Calls！）
    const bucketMatMap = [
      ['min_mansion', matLimeOsm, true],
      ['min_greybrick', matGreyBrickOsm, true],
      ['nanhou_arcade', matNanhouOsm, true],
      ['republican_red', matRepRedOsm, true],
      ['republican_grey', matRepGreyOsm, true],
      ['temple', matVermilion, true],
      ['modern_edge', matModernEdge, false]
    ];
    for (const [key, mat, castSh] of bucketMatMap) {
      const mGeo = mergeGeoList(wallBuckets[key]);
      if (mGeo) {
        const mesh = addMesh(mGeo, mat, 0, 0, 0, districtGrp, castSh, true);
        mesh.name = 'osm-buildings-' + key;
      }
    }
    const mergedPlinths = mergeGeoList(plinthGeos);
    if (mergedPlinths) addMesh(mergedPlinths, matGraniteDark, 0, 0, 0, districtGrp, false, true);
    const mergedFlatCaps = mergeGeoList(flatTileCapGeos);
    if (mergedFlatCaps) addMesh(mergedFlatCaps, matRoofRibs, 0, 0, 0, districtGrp, false, true);

    // 提交合批屋顶、3 种福建曲线马鞍墙、民国女儿墙、骑楼构件与灯笼
    const addVariedBatch = (name, mat, matrices, colorFn) => {
      if (!matrices.length) return;
      const inst = new T.InstancedMesh(unitBoxGeo, mat, matrices.length);
      inst.name = name; inst.receiveShadow = true;
      matrices.forEach((m, i) => { inst.setMatrixAt(i, m); if (colorFn) inst.setColorAt(i, colorFn(i)); });
      districtGrp.add(inst);
    };
    addVariedBatch('district-roof-slopes', matRoofRibs, dRoofSlopeMats, () => {
      const v = 0.78 + rnd() * 0.36;
      return new T.Color(v * 0.98, v, v * 1.03);
    });
    addInstBatch('district-roof-ridges', matTileRidge, dRoofRidgeMats, districtGrp, false);
    addInstBatch('district-republican-parapets', matLime, dParapetMats, districtGrp, false);
    addInstBatch('district-arcade-wood', matWoodDark, dArcadeWoodMats, districtGrp, false);
    addInstBatch('district-shop-banners', matVermilion, dBannerMats, districtGrp, false);

    saddleVariants.forEach((sv, idx) => {
      const mats = saddleMatsByVar[idx];
      if (!mats.length) return;
      const wInst = new T.InstancedMesh(sv.wallGeo, matLime, mats.length);
      wInst.name = 'district-fujian-saddle-wall-' + idx; wInst.receiveShadow = true;
      const cInst = new T.InstancedMesh(sv.capGeo, matTileRidge, mats.length);
      cInst.name = 'district-fujian-saddle-cap-' + idx;
      mats.forEach((m, i) => { wInst.setMatrixAt(i, m); cInst.setMatrixAt(i, m); });
      districtGrp.add(wInst); districtGrp.add(cInst);
    });

    // 6.3 在真实 OSM 交口安放南后街南北大牌坊 + 三坊七巷各坊口书法牌坊 + 安民巷口网红爱心树
    const nhN = osmData.nanhou.north, nhS = osmData.nanhou.south;
    const nhAngle = Math.atan2(nhN[0] - nhS[0], nhN[1] - nhS[1]); // 南后街真实倾角 (~10°)
    buildPaifang(nhN[0], nhN[1] - 2.0, nhAngle, '三坊七巷', 1.32);
    buildPaifang(nhS[0], nhS[1] + 4.0, nhAngle, '南后街', 1.26);

    for (const lane of osmData.lanes) {
      const [ex, ez] = lane.entry;
      const dirX = Math.cos(lane.ang), dirZ = Math.sin(lane.ang);
      // 牌坊安放于坊口略向坊内缩进 5m 处，垂直于真实坊巷走向
      const px = ex + dirX * 5.2, pz = ez + dirZ * 5.2;
      buildPaifang(px, pz, -lane.ang + Math.PI / 2, lane.name, 0.80);

      // 真实安民巷 × 南后街交口：安放网红「爱心树」
      if (lane.name === '安民巷') {
        addBotanicalTree(ex + 1.8, 0, ez + 3.2, 6.2, 4.8, 'heart-banyan');
      }

      // 高空导览铭牌（位于各真实坊巷中段上空）
      const isSanfang = ['衣锦坊', '文儒坊', '光禄坊'].includes(lane.name);
      const sp = makeMapLabelSprite(lane.name, isSanfang ? '三坊（真实位置）' : '七巷（真实位置）', isSanfang ? '#1c4230' : '#2c4a3d');
      const lx = T.MathUtils.lerp(ex, lane.mid[0], 0.45);
      const lz = T.MathUtils.lerp(ez, lane.mid[1], 0.45);
      sp.position.set(lx, 24.0, lz);
      sp.scale.set(24, 7.2, 1);
      mapLabelsGroup.add(sp);
    }

    // 核心地标高空导览铭牌（基于真实 OSM POI 坐标）
    const coreMarkers = [
      { title: '水榭戏台', sub: '衣锦坊 4 号 · 1:1 精建', x: 0, z: -2, color: '#9c2c22', s: 28 },
      { title: '南后街', sub: '626m 真实中轴', x: (nhN[0] + nhS[0]) * 0.5, z: (nhN[1] + nhS[1]) * 0.5, color: '#1b3d2d', s: 32 },
      { title: '安民巷 · 爱心树', sub: '南后街交口（示意）', x: -95.5, z: -156.0, color: '#a22c24', s: 26 },
      { title: '安泰河 · 澳门桥', sub: '真实河道', x: -148.0, z: -404.0, color: '#214d57', s: 25 }
    ];
    for (const p of osmData.pois) {
      if (p.name === '水榭戏台') continue;
      coreMarkers.push({ title: p.name, sub: 'OSM 实标位置', x: p.x, z: p.z, color: '#5c4624', s: 22 });
    }
    for (const mk of coreMarkers) {
      const sp = makeMapLabelSprite(mk.title, mk.sub, mk.color);
      sp.position.set(mk.x, 30.0, mk.z);
      sp.scale.set(mk.s, mk.s * 0.30, 1);
      mapLabelsGroup.add(sp);
    }
  }

  // 提交红灯笼、假山叠石、树干与真实镂空叶片簇 InstancedMesh
  if (lanternMats.length) {
    const lInst = new T.InstancedMesh(new T.SphereGeometry(1, 8, 6), matLantern, lanternMats.length);
    lInst.name = 'district-street-lanterns';
    lanternMats.forEach((m, i) => lInst.setMatrixAt(i, m));
    districtGrp.add(lInst);
  }
  const rockGeo = new T.DodecahedronGeometry(1, 0);
  for (const [mats, mat] of [[rockMatsDark, matRock], [rockMatsLight, matGraniteDark]]) {
    if (!mats.length) continue;
    const rInst = new T.InstancedMesh(rockGeo, mat, mats.length);
    rInst.castShadow = true; rInst.receiveShadow = true;
    mats.forEach((m, i) => rInst.setMatrixAt(i, m));
    scene.add(rInst);
  }
  if (trunkMats.length) {
    const tInst = new T.InstancedMesh(new T.CylinderGeometry(0.75, 1.0, 1.0, 7), matWoodDark, trunkMats.length);
    tInst.name = 'botanical-trunks'; tInst.castShadow = true; tInst.receiveShadow = true;
    trunkMats.forEach((m, i) => tInst.setMatrixAt(i, m));
    scene.add(tInst);
  }
  if (leafCardMats.length) {
    const fInst = new T.InstancedMesh(new T.PlaneGeometry(1.0, 1.0), matLeafCard, leafCardMats.length);
    fInst.name = 'botanical-leaf-clusters'; fInst.castShadow = true; fInst.receiveShadow = true;
    leafCardMats.forEach((m, i) => { fInst.setMatrixAt(i, m); fInst.setColorAt(i, leafCardCols[i]); });
    scene.add(fInst);
  }

  // ==================== 6.5 晴日白昼 / 华灯初上（夜景亮灯）一键切换 ====================
  function setTimeOfDay(mode) {
    const isDusk = mode === 'dusk';
    $('#time-day').setAttribute('aria-pressed', String(!isDusk));
    $('#time-dusk').setAttribute('aria-pressed', String(isDusk));
    view.dataset.time = mode;
    if (isDusk) {
      skyUniforms.topColor.value.setHex(0x101c34);
      skyUniforms.midColor.value.setHex(0x283a58);
      skyUniforms.horizonColor.value.setHex(0x6d5044);
      scene.background.setHex(0x24314a);
      scene.fog.color.setHex(0x3a3742);
      sun.color.setHex(0xffa968); sun.intensity = 0.75;
      hemiLight.color.setHex(0x4b6392); hemiLight.groundColor.setHex(0x3c2d22); hemiLight.intensity = 0.72;
      waterBounce.intensity = 0.35;
      eaveFill.color.setHex(0xffba6b); eaveFill.intensity = 4.6;
      matLantern.emissiveIntensity = 2.4;
      matNanhouOsm.emissiveIntensity = 1.45;
      matRepRedOsm.emissiveIntensity = 1.25;
      matRepGreyOsm.emissiveIntensity = 1.25;
      matPaperWindow.emissiveIntensity = 1.35;
      renderer.toneMappingExposure = 1.07;
      scene.environmentIntensity = 0.13;
    } else {
      skyUniforms.topColor.value.setHex(0x8fb1c0);
      skyUniforms.midColor.value.setHex(0xd9e0d8);
      skyUniforms.horizonColor.value.setHex(0xe7e3d6);
      scene.background.setHex(0xd8e2de);
      scene.fog.color.setHex(0xd8e2de);
      sun.color.setHex(0xfff1d6); sun.intensity = 2.10;
      hemiLight.color.setHex(0xeaf1f2); hemiLight.groundColor.setHex(0xb8b29c); hemiLight.intensity = 1.80;
      waterBounce.intensity = 0.72;
      eaveFill.color.setHex(0xfaefd9); eaveFill.intensity = 2.55;
      matLantern.emissiveIntensity = 0.55;
      matNanhouOsm.emissiveIntensity = 0.14;
      matRepRedOsm.emissiveIntensity = 0.12;
      matRepGreyOsm.emissiveIntensity = 0.12;
      matPaperWindow.emissiveIntensity = 0.16;
      renderer.toneMappingExposure = 1.02;
      scene.environmentIntensity = 0.32;
    }
    dirty = true;
  }
  $('#time-day').addEventListener('click', () => setTimeOfDay('day'));
  $('#time-dusk').addEventListener('click', () => setTimeOfDay('dusk'));

  // ==================== 7. 相机预设、轨道环视/第一人称自由漫步、双击飞至与画面导出 ====================
  const goal = new T.Vector3();
  const look = new T.Vector3();
  const cameraPos = new T.Vector3();
  const spherical = new T.Spherical();
  const raycaster = new T.Raycaster();
  const ndc = new T.Vector2();
  const upVec = new T.Vector3(0, 1, 0);
  const heldKeys = new Set();

  let choice = 'front';
  let navMode = 'orbit';
  let drag = null;
  let dragMode = 'orbit';
  const activePointers = new Map();
  let lastPinchDist = 0;
  let transition = false;
  let dirty = true;
  let w = 0, h = 0;

  const controlsHint = $('#controls-hint');
  function setNavMode(mode, adjustHeight = false) {
    navMode = mode;
    $('#mode-orbit').setAttribute('aria-pressed', String(mode === 'orbit'));
    $('#mode-walk').setAttribute('aria-pressed', String(mode === 'walk'));
    view.dataset.navMode = mode;
    if (controlsHint) {
      controlsHint.textContent = mode === 'walk'
        ? '第一人称漫步：左键拖拽原地环顾，滚轮/WASD/方向键沿街自由步行，Q/E 升降视角，双击任意处飞至该处。'
        : '左键拖拽旋转，右键/Shift+左键平移，滚轮缩放，双击场景飞至该处；随时按 WASD 行走、Q/E 升降、方向键微调。';
    }
    if (mode === 'walk') {
      const dir = goal.clone().sub(cameraPos);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
      dir.normalize();
      if (adjustHeight && cameraPos.y > 16) {
        cameraPos.y = 3.0;
        dir.y = -0.04;
        dir.normalize();
      }
      goal.copy(cameraPos).addScaledVector(dir, 14.0);
      transition = true;
      dirty = true;
    }
  }

  function applyPose(pose, name, snap = false, customNote = '') {
    choice = name;
    cameraPos.set(pose[0], pose[1], pose[2]);
    goal.set(pose[3], pose[4], pose[5]);
    transition = !snap;
    if (snap) {
      camera.position.copy(cameraPos);
      look.copy(goal);
      camera.lookAt(look);
    }
    document.querySelectorAll('[data-view], #district-overview, #nanhou-street, #heart-tree-view').forEach((b) => {
      const idMatch = (b.dataset.view && b.dataset.view === name)
        || (b.id === 'district-overview' && name === 'district')
        || (b.id === 'nanhou-street' && name === 'nanhou')
        || (b.id === 'heart-tree-view' && name === 'heart-tree');
      b.setAttribute('aria-pressed', String(Boolean(idMatch)));
    });
    view.dataset.camera = name;
    const activeBtn = $('[data-view="' + name + '"]');
    $('#view-note').textContent = customNote || (activeBtn ? activeBtn.dataset.note : '');
    dirty = true;
  }

  function choose(name, snap = false) {
    const v = A.views[name];
    if (!v) return;
    applyPose(v, name, snap);
  }

  function markFreeExplore() {
    if (choice === 'district' && cameraPos.y < 38) choice = 'free';
  }

  function orbit(az = 0, el = 0, zoom = 1) {
    const offset = cameraPos.clone().sub(goal);
    spherical.setFromVector3(offset);
    spherical.theta += az;
    spherical.phi = T.MathUtils.clamp(spherical.phi + el, 0.10, 1.92);
    spherical.radius = T.MathUtils.clamp(spherical.radius * zoom, 2.2, 650.0);
    offset.setFromSpherical(spherical);
    cameraPos.copy(goal).add(offset);
    if (cameraPos.y < 0.85) cameraPos.y = 0.85;
    markFreeExplore();
    transition = true;
    dirty = true;
  }

  function lookAround(yawDelta = 0, pitchDelta = 0) {
    const offset = goal.clone().sub(cameraPos);
    const dist = Math.max(4.0, offset.length());
    spherical.setFromVector3(offset);
    spherical.theta += yawDelta;
    spherical.phi = T.MathUtils.clamp(spherical.phi + pitchDelta, 0.28, Math.PI - 0.28);
    spherical.radius = dist;
    offset.setFromSpherical(spherical);
    goal.copy(cameraPos).add(offset);
    markFreeExplore();
    transition = true;
    dirty = true;
  }

  function moveFree(rightAmt, fwdAmt, upAmt = 0) {
    const fwd = goal.clone().sub(cameraPos);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new T.Vector3().crossVectors(fwd, upVec).normalize();
    const delta = new T.Vector3().addScaledVector(right, rightAmt).addScaledVector(fwd, fwdAmt);
    delta.y = upAmt;
    cameraPos.add(delta);
    goal.add(delta);
    if (cameraPos.y < 0.95) {
      const lift = 0.95 - cameraPos.y;
      cameraPos.y = 0.95;
      goal.y += lift;
    }
    cameraPos.x = T.MathUtils.clamp(cameraPos.x, -460, 360);
    cameraPos.z = T.MathUtils.clamp(cameraPos.z, -490, 340);
    cameraPos.y = T.MathUtils.clamp(cameraPos.y, 0.95, 520);
    markFreeExplore();
    transition = true;
    dirty = true;
  }

  function pan(dx, dz) {
    const distScale = Math.max(0.05, cameraPos.distanceTo(goal) * 0.0022);
    moveFree(dx * distScale, dz * distScale, 0);
  }

  $('#mode-orbit').addEventListener('click', () => setNavMode('orbit'));
  $('#mode-walk').addEventListener('click', () => setNavMode('walk', true));

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => { setNavMode('orbit'); choose(b.dataset.view); });
  });
  $('#reset').addEventListener('click', () => { setNavMode('orbit'); choose('front'); });
  $('#district-overview').addEventListener('click', () => {
    setNavMode('orbit');
    applyPose(
      A.districtOverview, 'district', false,
      '1:1 真实 OpenStreetMap 地理底图俯瞰（682 栋真实建筑轮廓 + 86 条曲折街巷）：南后街沿真实约 10° 轴线纵贯 626 米，西三坊东七巷与安泰河按真实位置展开，双击任意建筑即可飞入近看！'
    );
  });
  $('#nanhou-street').addEventListener('click', () => {
    applyPose(
      A.nanhouStreetView, 'nanhou', false,
      '真实南后街北口大牌坊（1:1 尺度）：两侧错落分布明清木构骑楼与民国红/青砖拱券洋楼（装潢示意）。可按 WASD 或滚轮沿 626 米南后街一路向南漫步，也可切换「华灯初上」看夜景亮灯！'
    );
    setNavMode('walk', false);
  });
  $('#heart-tree-view').addEventListener('click', () => {
    applyPose(
      heartTreePose, 'heart-tree', false,
      '爱心榕树：按地面照片与航拍预览调整树冠体积、浅凹口和偏侧主干。拖动可环绕检查，滚轮缩放；这是参考建模，尺寸和背面枝条尚无测绘依据。'
    );
    setNavMode('orbit', false);
  });
  $('#zoom-in').addEventListener('click', () => { if (navMode === 'walk') moveFree(0, 3.8, 0); else orbit(0, 0, 0.82); });
  $('#zoom-out').addEventListener('click', () => { if (navMode === 'walk') moveFree(0, -3.8, 0); else orbit(0, 0, 1.22); });

  view.addEventListener('contextmenu', (e) => e.preventDefault());
  view.addEventListener('pointerdown', (e) => {
    view.focus({ preventScroll: true });
    view.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (activePointers.size === 1) {
      drag = [e.clientX, e.clientY];
      dragMode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : (navMode === 'walk' ? 'look' : 'orbit');
      view.classList.add('drag');
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      lastPinchDist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      drag = null;
    }
  });
  view.addEventListener('pointermove', (e) => {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const dist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      if (lastPinchDist > 1 && dist > 1) {
        if (navMode === 'walk') moveFree(0, (dist - lastPinchDist) * 0.06, 0);
        else orbit(0, 0, lastPinchDist / dist);
      }
      lastPinchDist = dist;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
    if (dragMode === 'pan') pan(-dx * 0.9, dy * 0.9);
    else if (dragMode === 'look') lookAround(-dx * 0.0042, -dy * 0.0038);
    else orbit(-dx * 0.0046, -dy * 0.0042);
    drag = [e.clientX, e.clientY];
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    view.addEventListener(ev, (e) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = 0;
      if (activePointers.size === 0) { drag = null; view.classList.remove('drag'); }
    });
  }
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (navMode === 'walk') {
      const step = Math.max(1.5, Math.min(8.0, cameraPos.y * 0.35));
      moveFree(0, e.deltaY > 0 ? -step : step, 0);
    } else {
      orbit(0, 0, e.deltaY > 0 ? 1.12 : 0.89);
    }
  }, { passive: false });

  const rayTargets = [siteGroup, stage, yardGroup, hall, districtGrp];
  view.addEventListener('dblclick', (e) => {
    const rect = view.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(rayTargets, true);
    if (!hits.length) return;
    const p = hits[0].point;
    const horiz = new T.Vector3(cameraPos.x - p.x, 0, cameraPos.z - p.z);
    if (horiz.lengthSq() < 0.01) horiz.set(0, 0, 1);
    horiz.normalize();
    const camDist = navMode === 'walk' ? 10.5 : 18.0;
    const camHeight = navMode === 'walk' ? Math.max(2.6, p.y + 2.2) : Math.max(6.5, p.y + 8.5);
    cameraPos.set(p.x + horiz.x * camDist, camHeight, p.z + horiz.z * camDist);
    goal.set(p.x, Math.max(2.0, Math.min(p.y + 1.5, 10.0)), p.z);
    choice = 'free';
    transition = true;
    dirty = true;
  });

  const navKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);
  window.addEventListener('keydown', (e) => {
    if (photoDialog && photoDialog.open) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); if (navMode === 'walk') moveFree(0, 3.0, 0); else orbit(0, 0, 0.84); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); if (navMode === 'walk') moveFree(0, -3.0, 0); else orbit(0, 0, 1.18); return; }
    if (navKeys.has(e.code)) { e.preventDefault(); heldKeys.add(e.code); dirty = true; }
  });
  window.addEventListener('keyup', (e) => heldKeys.delete(e.code));
  window.addEventListener('blur', () => heldKeys.clear());

  new ResizeObserver(() => {
    const ww = view.clientWidth, hh = view.clientHeight;
    if (ww && hh && (ww !== w || hh !== h)) {
      w = ww; h = hh; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); dirty = true;
    }
  }).observe(view);

  choose('front', true);
  if (!globalThis.__OFFLINE_EXPORT) setTimeOfDay('day');

  $('#export-colab')?.addEventListener('click', async () => {
    const button = $('#export-colab'); button.disabled = true;
    try { await saveCourtyard(scene, A, statusEl); }
    catch (error) { statusEl.textContent = error.message; }
    finally { button.disabled = false; }
  });

  let previous = 0, frameCount = 0;
  renderer.setAnimationLoop((t) => {
    if (document.hidden) return;
    if ($('#render-preview') && !$('#render-preview').hidden) return;
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && t - previous < 20 && !dirty && !transition && heldKeys.size === 0) return;
    if (!animate && !dirty && !transition && heldKeys.size === 0) return;
    const dt = previous ? Math.min(0.08, (t - previous) * 0.001) : 0.016;
    previous = t;

    if (heldKeys.size > 0) {
      const speed = Math.max(10.0, Math.min(85.0, cameraPos.y * 0.85 + 8.5)) * dt;
      const vSpeed = Math.max(7.0, Math.min(60.0, cameraPos.y * 0.65 + 5.5)) * dt;
      let f = 0, r = 0, u = 0;
      if (heldKeys.has('KeyW')) f += speed;
      if (heldKeys.has('KeyS')) f -= speed;
      if (heldKeys.has('KeyD')) r += speed;
      if (heldKeys.has('KeyA')) r -= speed;
      if (heldKeys.has('KeyE') || heldKeys.has('PageUp')) u += vSpeed;
      if (heldKeys.has('KeyQ') || heldKeys.has('PageDown')) u -= vSpeed;
      if (navMode === 'walk') {
        if (heldKeys.has('ArrowUp')) f += speed;
        if (heldKeys.has('ArrowDown')) f -= speed;
        if (heldKeys.has('ArrowLeft')) lookAround(1.45 * dt, 0);
        if (heldKeys.has('ArrowRight')) lookAround(-1.45 * dt, 0);
      } else {
        if (heldKeys.has('ArrowLeft')) orbit(-1.35 * dt, 0, 1);
        if (heldKeys.has('ArrowRight')) orbit(1.35 * dt, 0, 1);
        if (heldKeys.has('ArrowUp')) orbit(0, 1.05 * dt, 1);
        if (heldKeys.has('ArrowDown')) orbit(0, -1.05 * dt, 1);
      }
      if (f !== 0 || r !== 0 || u !== 0) moveFree(r, f, u);
    }

    if (transition) {
      const rate = (drag || heldKeys.size > 0) ? 18.0 : 8.2;
      const alpha = animate ? 1 - Math.exp(-rate * dt) : 1;
      camera.position.lerp(cameraPos, alpha);
      look.lerp(goal, alpha);
      camera.lookAt(look);
      if (camera.position.distanceTo(cameraPos) < 0.015 && look.distanceTo(goal) < 0.015) {
        camera.position.copy(cameraPos); look.copy(goal); camera.lookAt(look); transition = false;
      }
    }

    // 相机跟随式动态阴影聚焦（确保在 760m × 760m 全区任何坊巷漫步阴影始终锐利）
    const sx = Math.round(look.x / 2) * 2, sz = Math.round(look.z / 2) * 2;
    if (sun.target.position.x !== sx || sun.target.position.z !== sz) {
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + sunOffset.x, sunOffset.y, sz + sunOffset.z);
    }
    const shadowExtent = Math.abs(look.x) < 24 && Math.abs(look.z) < 28 && camera.position.y < 35 ? 18 : 46;
    if (sun.shadow.camera.right !== shadowExtent) {
      Object.assign(sun.shadow.camera, {left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent});
      sun.shadow.camera.updateProjectionMatrix();
    }

    const sec = animate ? t * 0.001 : 0;
    heartTreeControllers.forEach(tree => tree.update(sec));
    waterUniforms.clock.value = sec;
    reflector.material.uniforms.time.value = sec;
    koiList.forEach((k) => {
      const ang = sec * k.speed + k.phase;
      const nx = Math.cos(ang) * k.rx, nz = k.cz + Math.sin(ang) * k.rz;
      k.mesh.position.set(nx, pool.y - 0.06, nz);
      k.mesh.rotation.y = Math.atan2(-Math.sin(ang) * k.rx, Math.cos(ang) * k.rz);
    });

    mapLabelsGroup.visible = choice === 'district' || camera.position.y > 42.0;

    renderer.render(scene, camera);
    if (!frameCount++) {
      view.dataset.webgl = 'ready';
      statusEl.textContent = '三维场景已就绪';
    }
    view.dataset.eye = camera.position.toArray().map((k) => k.toFixed(2)).join(',');
    view.dataset.drawCalls = String(renderer.info.render.calls);
    dirty = false;
  });

  $('#save-view').addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
      if (!blob) { statusEl.textContent = '无法保存当前画面'; return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'SanfangQixiang-1to1-' + choice + '.jpg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/jpeg', 0.94);
  });
}
