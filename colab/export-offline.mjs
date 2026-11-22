// Execute the project's existing geometry builders without opening a WebGL context.
// Native Canvas2D preserves the original paintings, carved panels, and leaf masks.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, 'colab', '.offline-export');
await fs.mkdir(scratch, {recursive: true});
GlobalFonts.loadSystemFonts();
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    dataset: {}, style: {}, hidden: false, disabled: false, textContent: '',
    clientWidth: 1280, clientHeight: 800, classList: {add(){}, remove(){}},
    append(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    focus(){}, showModal(){}, close(){}, getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}
  });
  return elements.get(id);
};
globalThis.document = {
  hidden: false, querySelector: element, querySelectorAll: () => [], addEventListener(){},
  createElement: name => name === 'canvas' ? createCanvas(256, 256) : element('created-' + name)
};
globalThis.__OFFLINE_EXPORT = true;
globalThis.window = {devicePixelRatio: 1, addEventListener(){}};
globalThis.location = {search: ''};
globalThis.matchMedia = () => ({matches: false});
globalThis.ResizeObserver = class {constructor(callback){this.callback=callback;} observe(){this.callback();}};
globalThis.fetch = async url => {
  try {const data = await fs.readFile(path.join(root, String(url))); return {ok:true,json:async()=>JSON.parse(data)};}
  catch {return {ok:false};}
};
globalThis.__offlineRenderer = {
  domElement: {addEventListener(){}, toBlob(){}}, shadowMap: {},
  setPixelRatio(){}, setSize(){}, setAnimationLoop(){}, render(){},
  capabilities: {getMaxAnisotropy:()=>8}, info: {render:{calls:0}}
};
for (const file of ['three.module.min.js','three.core.min.js','model.mjs']) await fs.copyFile(path.join(root,file),path.join(scratch,file));
for (const file of ['Reflector.js','colab-export.mjs','visual-quality.mjs','heart-tree.mjs']) {
  let source = await fs.readFile(path.join(root,file),'utf8');
  source = source.replaceAll("from 'three'", "from './three.module.min.js'");
  await fs.writeFile(path.join(scratch,file),source);
}
let source = await fs.readFile(path.join(root,'renderer.mjs'),'utf8');
source = source.replaceAll("from 'three'", "from './three.module.min.js'")
  .replace("import { saveCourtyard }", "import { saveCourtyard, exportCourtyard }");
const start = source.indexOf('const forceFallback');
const end = source.indexOf('// 轻量级 BufferGeometry');
if(start < 0 || end < start) throw new Error('Geometry bootstrap structure changed; review exporter');
source = source.slice(0,start) + 'let R = globalThis.__offlineRenderer; await initScene(R);\n\n' + source.slice(end);
source = source.replace("choose('front', true);", "choose('front', true); globalThis.__courtyard = exportCourtyard(scene, A);");
await fs.writeFile(path.join(scratch,'build.mjs'),source);
await import(pathToFileURL(path.join(scratch,'build.mjs')).href);
if (!globalThis.__courtyard?.objects.length) throw new Error('No courtyard geometry was exported');
const output = path.join(root,'colab','sanfang-scene.json');
await fs.writeFile(output,JSON.stringify(globalThis.__courtyard));
console.log(JSON.stringify({output,objects:globalThis.__courtyard.objects.length,instances:globalThis.__courtyard.objects.reduce((n,o)=>n+o.matrices.length,0),geometries:Object.keys(globalThis.__courtyard.geometries).length,textures:Object.keys(globalThis.__courtyard.textures).length}));
