import * as T from 'three';

export async function applyColabMaterials(materials, renderer) {
  const response = await fetch('./assets/pbr/manifest.json');
  if (!response.ok) throw new Error('材质资源尚未就绪');
  const manifest = await response.json();
  if (!manifest.materials) return;
  const loader = new T.TextureLoader();
  const cache = new Map();
  const load = async (filename, color, repeat) => {
    const key = [filename, repeat.x, repeat.y].join(':');
    if (!cache.has(key)) cache.set(key, (async () => {
      const texture = await loader.loadAsync('./assets/pbr/' + filename);
      texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.copy(repeat);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
    })());
    return cache.get(key);
  };
  const changes = await Promise.all(materials.filter(m => m.userData.colabSemantic).map(async material => {
    const record = manifest.materials[material.userData.colabSemantic];
    const repeat = material.map?.repeat.clone() || new T.Vector2(1,1);
    const [map, normalMap, roughnessMap] = await Promise.all([
      load(record.color, true, repeat), load(record.normal, false, repeat), load(record.roughness, false, repeat)
    ]);
    const original = {color: material.color.clone(), map:material.map, bumpMap:material.bumpMap, normalMap:material.normalMap, roughnessMap:material.roughnessMap, roughness:material.roughness};
    const tint = material.name === 'dark-fir' ? 0xaaa093 : material.name === 'eave-fir' ? 0xb7ad9e : 0xffffff;
    return {material, original, enhanced:{color:new T.Color(tint),map,normalMap,roughnessMap,bumpMap:null,roughness:1}};
  }));
  const select = enabled => {
    for (const {material, original, enhanced} of changes) {
      const state = enabled ? enhanced : original;
      material.color.copy(state.color);
      for (const key of ['map','normalMap','roughnessMap','bumpMap','roughness']) material[key]=state[key];
      material.normalScale.set(0.65,0.65);
      material.needsUpdate=true;
    }
    document.querySelector('#quality-enhanced')?.setAttribute('aria-pressed',String(enabled));
    document.querySelector('#quality-original')?.setAttribute('aria-pressed',String(!enabled));
    document.querySelector('#viewport').dataset.materials=enabled?'colab-pbr':'original';
  };
  document.querySelector('#quality-enhanced')?.addEventListener('click',()=>select(true));
  document.querySelector('#quality-original')?.addEventListener('click',()=>select(false));
  select(true);
}

export function courtyardWaterShader() {
  return {
    uniforms:{color:{value:new T.Color(0x2c4c42)},tDiffuse:{value:null},textureMatrix:{value:new T.Matrix4()},time:{value:0}},
    vertexShader:`
      uniform mat4 textureMatrix;
      varying vec4 vReflection;
      varying vec3 vWorld;
      void main(){
        vWorld=(modelMatrix*vec4(position,1.0)).xyz;
        vReflection=textureMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader:`
      uniform vec3 color; uniform sampler2D tDiffuse; uniform float time;
      varying vec4 vReflection; varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;
        vec2 ripple=vec2(sin(p.x*7.1+p.y*3.2+time*.48),sin(p.y*8.3-p.x*2.7-time*.37));
        vec2 uv=vReflection.xy/vReflection.w+ripple*.00075;
        vec3 reflected=texture2D(tDiffuse,uv).rgb;
        vec3 eye=normalize(cameraPosition-vWorld);
        float fresnel=.02+.98*pow(1.0-clamp(eye.y,0.0,1.0),5.0);
        float detail=sin(p.x*11.0+p.y*13.0+time*.62)*.006;
        vec3 depthColor=color*(.78+detail);
        gl_FragColor=vec4(mix(depthColor,reflected,.38+fresnel*.57),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
}

export function installSoftEnvironment(scene, renderer) {
  const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=64;
  const context=canvas.getContext('2d');
  const gradient=context.createLinearGradient(0,0,0,64);
  gradient.addColorStop(0,'#95aeba');gradient.addColorStop(.48,'#e7e6db');
  gradient.addColorStop(.53,'#b0b8a4');gradient.addColorStop(1,'#777a68');
  context.fillStyle=gradient;context.fillRect(0,0,128,64);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.mapping=T.EquirectangularReflectionMapping;
  const pmrem=new T.PMREMGenerator(renderer);
  const environment=pmrem.fromEquirectangular(texture);
  scene.environment=environment.texture;scene.environmentIntensity=.32;
  texture.dispose();pmrem.dispose();
}

export function installRenderGallery() {
  const panel=document.querySelector('#render-preview');
  const image=document.querySelector('#render-image');
  const caption=document.querySelector('#render-caption');
  const setMode = offline => {
    panel.hidden=!offline;
    document.querySelector('#mode-live').setAttribute('aria-pressed',String(!offline));
    document.querySelector('#mode-render').setAttribute('aria-pressed',String(offline));
    document.querySelector('#zoom-controls').hidden=offline;
    document.querySelector('#scene-badge').hidden=offline;
    document.querySelector('#status').hidden=offline;
  };
  document.querySelector('#mode-live').addEventListener('click',()=>setMode(false));
  document.querySelector('#mode-render').addEventListener('click',()=>setMode(true));
  for (const button of document.querySelectorAll('[data-render]')) button.addEventListener('click',()=>{
    image.src=`./assets/renders/${button.dataset.render}.png`;
    image.alt=button.dataset.render==='front'?'隔池正看水榭戏台的 Colab 光影预览':'池岸斜看水榭戏台的 Colab 光影预览';
    caption.textContent=button.dataset.render==='front'?'隔池正看 · 柔和天光与杉木构架':'池岸斜看 · 翘角、灰墙与水中倒影';
    for(const item of document.querySelectorAll('[data-render]')) item.setAttribute('aria-pressed',String(item===button));
  });
}
