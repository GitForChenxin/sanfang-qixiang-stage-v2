"""Sanfang V4: deterministic PBR assets and Cycles rendering of the actual V3 mesh.

Run material synthesis in Colab Python; run --render in Blender's bundled Python.
No model API, paid API key, or external texture asset is required.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import math
import time

BASE = Path('/content/sanfang-workshop')
OUT = BASE / 'result'


def generate_materials(size=1024):
    import numpy as np
    from PIL import Image, ImageDraw
    directory = OUT / 'assets' / 'pbr'
    directory.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(350102)
    frequency = np.fft.fftfreq(size)
    f2 = frequency[:, None] ** 2 + frequency[None, :] ** 2

    def noise(sigma):
        field = rng.standard_normal((size, size)).astype(np.float32)
        field = np.fft.ifft2(np.fft.fft2(field) * np.exp(-2 * math.pi**2 * sigma**2 * f2)).real
        return (field / max(field.std(), 1e-6)).astype(np.float32)

    x, y = np.meshgrid(np.arange(size) / size, np.arange(size) / size)
    fine, medium, broad = noise(0.6), noise(5), noise(52)
    records = {}
    swatches = []
    for kind in ['lime', 'wood', 'granite', 'roof', 'slate']:
        if kind == 'lime':
            tone = 0.012 * fine + 0.012 * medium + 0.018 * broad
            base = np.array([0.83, 0.81, 0.75])
            height = fine * 0.012 + medium * 0.025
            roughness = 0.88 + medium * 0.025
        elif kind == 'wood':
            # Smooth periodic fibres and growth rings, with no straight black stripes.
            warp = np.sin(2*math.pi*y*2) * 0.003 + broad * 0.0025
            grain = np.sin(2*math.pi*(x + warp)*76)
            rings = np.sin(2*math.pi*(x*9 + 0.23*np.sin(y*2*math.pi)))
            tone = grain * 0.022 + rings * 0.024 + medium * 0.018 + broad * 0.018
            base = np.array([0.48, 0.32, 0.21])
            height = grain * 0.020 + rings * 0.015 + fine * 0.008
            roughness = 0.69 + medium * 0.045 + rings * 0.015
        elif kind == 'granite':
            fleck = np.clip(fine - 0.8, 0, 2)
            tone = fine * 0.035 + medium * 0.018 - fleck * 0.018
            base = np.array([0.62, 0.61, 0.56])
            height = fine * 0.016 + medium * 0.010
            roughness = 0.79 + fine * 0.025
        elif kind == 'roof':
            tone = medium * 0.022 + fine * 0.012 + broad * 0.015
            base = np.array([0.25, 0.28, 0.28])
            height = fine * 0.012 + medium * 0.016
            roughness = 0.76 + medium * 0.035
        else:
            tone = medium * 0.025 + fine * 0.012 + broad * 0.015
            base = np.array([0.39, 0.43, 0.41])
            height = medium * 0.025 + fine * 0.010
            roughness = 0.75 + medium * 0.04
        color = np.clip(base[None,None,:] + tone[:,:,None], 0, 1)
        # Wrapped differences keep the normal field periodic and avoid edge seams.
        dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.70
        dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.70
        normal = np.dstack([-dx, dy, np.ones_like(dx)])
        normal /= np.linalg.norm(normal, axis=2, keepdims=True)
        normal = normal * 0.5 + 0.5
        for suffix, pixels in [('color', color), ('normal', normal), ('roughness', np.clip(roughness, 0.45, 0.98))]:
            path = directory / f'{kind}-{suffix}.png'
            Image.fromarray(np.uint8(np.clip(pixels,0,1)*255)).save(path, optimize=True)
        records[kind] = {key: f'{kind}-{key}.png' for key in ['color','normal','roughness']}
        swatches.append((kind, Image.fromarray(np.uint8(color*255)).resize((240,240))))
    manifest = {'schema':'sanfang-pbr-v1','size':size,'seed':350102,'generator':'Colab deterministic multiscale synthesis; no photographic reconstruction claim','materials':records}
    (directory / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    sheet = Image.new('RGB',(1200,280),'#ece9df')
    draw = ImageDraw.Draw(sheet)
    for i,(name,image) in enumerate(swatches):
        sheet.paste(image,(i*240,0)); draw.text((i*240+12,252),name,fill='#28362b')
    sheet.save(OUT / 'assets' / 'materials-preview.jpg',quality=92)
    print('PBR_READY: 5 materials, 15 maps,',size,'px',flush=True)


def build_scene(scene_path):
    import bpy
    from mathutils import Matrix, Vector
    data = json.loads(Path(scene_path).read_text(encoding='utf-8'))
    assert data['schema'] == 'sanfang-colab-scene-v1'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images_dir = BASE / 'original-textures'
    images_dir.mkdir(exist_ok=True)
    materials = {}
    image_cache = {}

    def image(path, noncolor=False):
        key = (str(path),noncolor)
        if key not in image_cache:
            tex = bpy.data.images.load(str(path),check_existing=False)
            tex.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
            image_cache[key] = tex
        return image_cache[key]

    for key, item in data['textures'].items():
        raw = base64.b64decode(item['png'].split(',',1)[1])
        (images_dir / f'{key}.png').write_bytes(raw)

    for key, record in data['materials'].items():
        name, semantic = record.get('name') or key, record.get('semantic')
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        shader = nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = record.get('roughness',0.8)
        shader.inputs['Metallic'].default_value = record.get('metalness',0)
        shader.inputs['Base Color'].default_value = (*record['color'],1)
        shader.inputs['Specular IOR Level'].default_value = 0.35
        texcoord = nodes.new('ShaderNodeTexCoord')
        mapping = nodes.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'
        old_map = data['textures'].get(record.get('map'),{})
        repeat = old_map.get('repeat',[1,1])
        mapping.inputs[1].default_value = (repeat[0],repeat[1],1)
        links.new(texcoord.outputs['UV'],mapping.inputs[0])

        def texture(path,noncolor=False):
            node = nodes.new('ShaderNodeTexImage')
            node.image = image(path,noncolor)
            node.extension = 'REPEAT'
            links.new(mapping.outputs['Vector'],node.inputs['Vector'])
            return node

        if semantic:
            path = OUT/'assets'/'pbr'
            color = texture(path/f'{semantic}-color.png')
            normal = texture(path/f'{semantic}-normal.png',True)
            rough = texture(path/f'{semantic}-roughness.png',True)
            normalmap = nodes.new('ShaderNodeNormalMap')
            normalmap.inputs['Strength'].default_value = 0.65
            links.new(normal.outputs['Color'],normalmap.inputs['Color'])
            links.new(normalmap.outputs['Normal'],shader.inputs['Normal'])
            links.new(rough.outputs['Color'],shader.inputs['Roughness'])
            tint = 0.58 if name == 'dark-fir' else 0.68 if name == 'eave-fir' else 1.0
        elif record.get('map'):
            color = texture(images_dir/f"{record['map']}.png")
            tint = 1.0
            if record.get('alphaTest',0)>0:
                links.new(color.outputs['Alpha'],shader.inputs['Alpha'])
        else:
            color = None; tint=1.0
        if color:
            multiply = nodes.new('ShaderNodeMixRGB'); multiply.blend_type='MULTIPLY'
            multiply.inputs[0].default_value=1
            multiply.inputs[2].default_value=(tint,tint,tint,1)
            links.new(color.outputs['Color'],multiply.inputs[1])
            links.new(multiply.outputs['Color'],shader.inputs['Base Color'])
        if record.get('bump') and not semantic:
            bump_tex = texture(images_dir/f"{record['bump']}.png",True)
            bump = nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value=0.006
            bump.inputs['Strength'].default_value=0.25
            links.new(bump_tex.outputs['Color'],bump.inputs['Height'])
            links.new(bump.outputs['Normal'],shader.inputs['Normal'])
        emission = record.get('emissive') or [0,0,0]
        shader.inputs['Emission Color'].default_value=(*emission,1)
        shader.inputs['Emission Strength'].default_value=min(record.get('emissiveIntensity',0),0.5)
        materials[key]=mat

    # Three.js column-major Y-up matrices become Blender Z-up without rebuilding geometry.
    convert = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    mesh_cache = {}
    count = 0
    for record in data['objects']:
        geo = data['geometries'][record['geometry']]
        cache_key = (record['geometry'],tuple(record['materials']))
        if cache_key not in mesh_cache:
            positions = geo['position']
            vertices = [positions[i:i+3] for i in range(0,len(positions),3)]
            index = geo.get('index') or list(range(len(vertices)))
            faces = [index[i:i+3] for i in range(0,len(index),3)]
            mesh = bpy.data.meshes.new(record['name'])
            mesh.from_pydata(vertices,[],faces); mesh.update()
            for material_id in record['materials']: mesh.materials.append(materials[material_id])
            for group in geo.get('groups',[]):
                for face in mesh.polygons[group['start']//3:(group['start']+group['count'])//3]:
                    face.material_index = min(group.get('materialIndex',0),len(mesh.materials)-1)
            if geo.get('uv'):
                uvs = geo['uv']; layer = mesh.uv_layers.new(name='UVMap')
                for loop in mesh.loops:
                    i=loop.vertex_index*2; layer.data[loop.index].uv=(uvs[i],uvs[i+1])
            if geo.get('normal'):
                for face in mesh.polygons: face.use_smooth=True
                normals = geo['normal']
                mesh.normals_split_custom_set_from_vertices([normals[i:i+3] for i in range(0,len(normals),3)])
            mesh_cache[cache_key]=mesh
        for matrix in record['matrices']:
            obj=bpy.data.objects.new(record['name'],mesh_cache[cache_key])
            bpy.context.collection.objects.link(obj)
            obj.matrix_world=convert @ Matrix([matrix[i:i+4] for i in range(0,16,4)]).transposed()
            count+=1

    pool=data['architecture']['pool']
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0,-pool['zCenter'],pool['y']))
    water=bpy.context.object; water.name='physically-shaded-pool'
    water.scale=(pool['width'],pool['depth'],1)
    watermat=bpy.data.materials.new('Quiet courtyard water'); watermat.use_nodes=True
    nodes,links=watermat.node_tree.nodes,watermat.node_tree.links
    shader=nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(0.045,0.12,0.085,1)
    shader.inputs['Roughness'].default_value=0.14
    shader.inputs['IOR'].default_value=1.333
    shader.inputs['Transmission Weight'].default_value=0.62
    noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=8
    bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=0.16; bump.inputs['Distance'].default_value=0.018
    links.new(noise.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    water.data.materials.append(watermat)

    world=bpy.data.worlds.new('Soft Fuzhou daylight'); world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.66,0.76,0.82,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.80
    bpy.context.scene.world=world
    bpy.ops.object.light_add(type='SUN',location=(-42,-36,68))
    sun=bpy.context.object; sun.name='Afternoon daylight'; sun.data.energy=1.8; sun.data.angle=math.radians(8)
    sun.rotation_euler=(Vector((0,0,0))-sun.location).to_track_quat('-Z','Y').to_euler()
    # A broad, weak sky fill keeps traditional dark timber legible beneath the eaves.
    bpy.ops.object.light_add(type='AREA',location=(0,-4,6))
    fill=bpy.context.object; fill.data.energy=800; fill.data.shape='DISK'; fill.data.size=7
    fill.rotation_euler=(Vector((0,2,2))-fill.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene; scene.render.engine='CYCLES'
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='CUDA'; prefs.get_devices()
    gpu=[device for device in prefs.devices if device.type=='CUDA']
    assert gpu, 'A CUDA GPU is required; CPU fallback was not requested'
    for device in prefs.devices: device.use=device.type=='CUDA'
    scene.cycles.device='GPU'; scene.cycles.samples=64; scene.cycles.use_denoising=True
    scene.cycles.max_bounces=8; scene.cycles.transparent_max_bounces=8
    scene.render.resolution_x=1440; scene.render.resolution_y=960; scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'; scene.view_settings.exposure=0.15
    print('GPU_RENDER_DEVICE: '+', '.join(device.name for device in gpu),flush=True)
    print(f'IMPORTED_ORIGINAL_GEOMETRY: {count} mesh instances, {len(mesh_cache)} reusable mesh blocks',flush=True)
    bpy.ops.object.camera_add()
    camera=bpy.context.object; scene.camera=camera; camera.data.lens=16; camera.data.clip_end=2200
    renders=OUT/'assets'/'renders'; renders.mkdir(parents=True,exist_ok=True)
    cameras={
        'front':([0.10,2.45,6.90],[0,3.35,-2.05]),
        'side':([-3.20,2.60,6.75],[0.4,3.10,-2.10])
    }
    for name,(eye,target) in cameras.items():
        camera.location=(eye[0],-eye[2],eye[1])
        destination=Vector((target[0],-target[2],target[1]))
        camera.rotation_euler=(destination-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(renders/f'{name}.png')
        print('RENDER_START: '+name,flush=True)
        bpy.ops.render.render(write_still=True)
        print('RENDER_DONE: '+name,flush=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sanfang-courtyard-v4.blend'),compress=True)
    report={'source':data['source'],'meshInstances':count,'meshBlocks':len(mesh_cache),'gpu':[device.name for device in gpu],'samples':64,'resolution':[1440,960],'views':list(cameras),'pbrMaps':15,'limitations':'Core courtyard geometry only; illustrative model, no new survey evidence or photogrammetry.'}
    (OUT/'render-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('SANFANG_RENDER_SUCCESS',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--materials',action='store_true')
    parser.add_argument('--render',action='store_true')
    parser.add_argument('--scene',default=str(BASE/'colab'/'sanfang-scene.json'))
    args=parser.parse_args(__import__('sys').argv[__import__('sys').argv.index('--')+1:] if '--' in __import__('sys').argv else None)
    if args.materials: generate_materials()
    if args.render: build_scene(args.scene)
