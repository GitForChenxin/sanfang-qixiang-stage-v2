"""Create a self-contained, double-clickable preview with the same app code.

All module imports, OSM JSON, texture maps and preview images are embedded.
No server, file-access flag, extension permission or external CDN is needed.
"""
from pathlib import Path
import base64
import json
import re

ROOT=Path(__file__).resolve().parent.parent

def uri(path,mime):
    return f'data:{mime};base64,'+base64.b64encode(path.read_bytes()).decode('ascii')

def module(source):
    return 'data:text/javascript;base64,'+base64.b64encode(source.encode('utf-8')).decode('ascii')

def build():
    core=uri(ROOT/'three.core.min.js','text/javascript')
    three=(ROOT/'three.module.min.js').read_text(encoding='utf-8-sig')
    three=three.replace('"./three.core.min.js"',json.dumps(core))
    maps={path.name:uri(path,'image/png') for path in (ROOT/'assets/pbr').glob('*.png')}
    manifest=(ROOT/'assets/pbr/manifest.json').read_text(encoding='utf-8')
    renders={view:uri(ROOT/f'assets/renders/{view}.png','image/png') for view in ['front','side']}
    quality=(ROOT/'visual-quality.mjs').read_text(encoding='utf-8-sig')
    quality=quality.replace("  const response = await fetch('./assets/pbr/manifest.json');\n  if (!response.ok) throw new Error('材质资源尚未就绪');\n  const manifest = await response.json();",'  const manifest = '+manifest+';\n  const embeddedMaps = '+json.dumps(maps)+';')
    quality=quality.replace("loader.loadAsync('./assets/pbr/' + filename)",'loader.loadAsync(embeddedMaps[filename])')
    quality=quality.replace('export function installRenderGallery() {','export function installRenderGallery() {\n  const renderedImages='+json.dumps(renders)+';')
    quality=quality.replace('image.src=`./assets/renders/${button.dataset.render}.png`;','image.src=renderedImages[button.dataset.render];')
    renderer=(ROOT/'renderer.mjs').read_text(encoding='utf-8-sig')
    osm=(ROOT/'data/district-osm.json').read_text(encoding='utf-8-sig')
    renderer=renderer.replace("const resp = await fetch('./data/district-osm.json');",'const resp = {ok:true,json:async()=>('+osm+')};')
    for old,new in [('Reflector.js','reflector'),('model.mjs','model'),('colab-export.mjs','colab-export'),('visual-quality.mjs','visual-quality'),('heart-tree.mjs','heart-tree')]:
        renderer=renderer.replace("'./"+old+"'",json.dumps(new))
    imports={
        'three':module(three),
        'reflector':module((ROOT/'Reflector.js').read_text(encoding='utf-8-sig')),
        'model':module((ROOT/'model.mjs').read_text(encoding='utf-8-sig')),
        'colab-export':module((ROOT/'colab-export.mjs').read_text(encoding='utf-8-sig')),
        'visual-quality':module(quality),
        'heart-tree':module((ROOT/'heart-tree.mjs').read_text(encoding='utf-8-sig'))
    }
    html=(ROOT/'index.html').read_text(encoding='utf-8-sig')
    html=re.sub(r'<script type="importmap">.*?</script>','<script type="importmap">'+json.dumps({'imports':imports})+'</script>',html,count=1)
    html=html.replace('src="./assets/renders/front.png"','src="'+renders['front']+'"')
    html=html.replace('src="./reference.jpg"','src="'+uri(ROOT/'reference.jpg','image/jpeg')+'"')
    html=html.replace('<script type="module" src="./renderer.mjs"></script>','<script type="module">'+renderer+'</script>')
    destination=ROOT/'sanfang-v4-preview.html'
    destination.write_text(html,encoding='utf-8')
    print(json.dumps({'preview':str(destination),'bytes':destination.stat().st_size,'textures':len(maps),'offline':True},ensure_ascii=False))

if __name__=='__main__':build()
