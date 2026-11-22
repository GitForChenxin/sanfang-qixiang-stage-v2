"""Blender: render exported web geometry without making one object per leaf."""
from pathlib import Path
import bpy, gzip, json, math, time
import numpy as np
from mathutils import Vector

BASE=Path(__file__).resolve().parent
OUT=BASE/'heart-result'
OUT.mkdir(exist_ok=True)
source=json.loads(gzip.decompress((BASE/'heart-scene.json.gz').read_bytes()))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for item in source['meshes']:
    attr=item['attributes']
    vertices=np.asarray(attr['position'],dtype=np.float32).reshape(-1,3)
    faces=np.asarray(item['index'] if item['index'] else np.arange(len(vertices)),dtype=np.int32).reshape(-1,3)
    colors=np.asarray(attr.get('color',np.ones(vertices.shape)),dtype=np.float32).reshape(-1,3)
    matrices=np.asarray(item['matrices'],dtype=np.float32).reshape(-1,4,4).transpose(0,2,1)
    # Three Y-up to Blender Z-up; preserve the exact geometry and leaf instance colours.
    homogeneous=np.concatenate([vertices,np.ones((len(vertices),1),dtype=np.float32)],axis=1)
    transformed=np.einsum('nij,vj->nvi',matrices,homogeneous)[:,:,:3]
    transformed=transformed[:,:,[0,2,1]]
    transformed[:,:,1]*=-1
    full_faces=(faces[None,:,:]+np.arange(len(matrices))[:,None,None]*len(vertices)).reshape(-1,3)
    tints=np.asarray(item['colours'],dtype=np.float32).reshape(-1,3) if item['colours'] else np.ones((len(matrices),3))
    full_colors=(colors[None,:,:]*tints[:,None,:]*np.asarray(item['material']['color'])).reshape(-1,3)
    mesh=bpy.data.meshes.new(item['name'])
    mesh.from_pydata(transformed.reshape(-1,3).tolist(),[],full_faces.tolist());mesh.update()
    color_attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    rgba=np.concatenate([full_colors,np.ones((len(full_colors),1))],axis=1).astype(np.float32)
    color_attr.data.foreach_set('color',rgba.ravel())
    for polygon in mesh.polygons:polygon.use_smooth='leaves' not in item['name']
    obj=bpy.data.objects.new(item['name'],mesh);bpy.context.collection.objects.link(obj)
    mat=bpy.data.materials.new(item['name']);mat.use_nodes=True
    nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value=item['material']['roughness']
    vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color'
    mat.node_tree.links.new(vc.outputs['Color'],bsdf.inputs['Base Color'])
    if 'leaves' in item['name']:bsdf.inputs['Subsurface Weight'].default_value=.035
    obj.data.materials.append(mat)

# Neutral paving and understated scale markers keep the object inspection legible.
def plain(name,color,rough=.85):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=rough
    return m
stone=plain('neutral-stone',(.32,.34,.32))
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(stone)
world=bpy.context.scene.world or bpy.data.worlds.new('Daylight');bpy.context.scene.world=world
world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.72,.79,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.55
sun_data=bpy.data.lights.new('soft-sun','SUN');sun_data.energy=2.5;sun_data.angle=math.radians(7)
sun=bpy.data.objects.new('soft-sun',sun_data);bpy.context.collection.objects.link(sun)
sun.rotation_euler=(math.radians(30),math.radians(-20),math.radians(-28))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48
scene.cycles.use_denoising=True
gpu=[]
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
    for d in prefs.devices:
        d.use=d.type=='CUDA'
        if d.use:gpu.append(d.name)
    if gpu:scene.cycles.device='GPU'
except Exception:pass
print('HEART_GPU',gpu,flush=True)
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
cam_data=bpy.data.cameras.new('Inspection');cam=bpy.data.objects.new('Inspection',cam_data)
bpy.context.collection.objects.link(cam);scene.camera=cam;cam_data.type='ORTHO';cam_data.ortho_scale=11
views={'front':((0,-19,5.4),(0,0,4.35)), 'aerial':((12,-15,16),(0,0,4.3)), 'side':((18,-3,8),(0,0,4.5))}
started=time.time()
for name,(eye,target) in views.items():
    cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/f'heart-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('HEART_VIEW_DONE',name,flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sanfang-heart-v2.blend'))
(OUT/'heart-report.json').write_text(json.dumps({'source':'same web geometry','reference':'public aerial previews and ground photos; not surveyed','gpu':gpu,'views':list(views),'seconds':round(time.time()-started,1),'meta':source['meta']},indent=2),encoding='utf-8')
print('HEART_RENDER_SUCCESS',flush=True)
