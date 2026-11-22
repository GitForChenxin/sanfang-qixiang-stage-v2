import * as T from 'three';

// Export existing geometry, original UVs, material maps and individual instances.
// Blender reads this compact, versioned interchange file without a third-party addon.
export function exportCourtyard(scene, architecture) {
  scene.updateMatrixWorld(true);
  const output = {schema: 'sanfang-colab-scene-v1', architecture, geometries: {}, materials: {}, textures: {}, objects: [], source: 'Existing V3 GIS core courtyard geometry; illustrative, not a survey'};
  const acceptedRoots = new Set(['site-and-pool', 'waterside-stage', 'courtyard-enclosure', 'two-story-flower-hall']);
  const texture = (tex) => {
    if (!tex?.image) return null;
    if (!output.textures[tex.uuid]) {
      const image = tex.image;
      let png;
      if (image.toDataURL) png = image.toDataURL('image/png');
      else {
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        png = canvas.toDataURL('image/png');
      }
      output.textures[tex.uuid] = {png, repeat: tex.repeat.toArray(), offset: tex.offset.toArray()};
    }
    return tex.uuid;
  };
  const material = (mat) => {
    if (!output.materials[mat.uuid]) output.materials[mat.uuid] = {
      name: mat.name, color: mat.color?.toArray() || [0.4, 0.4, 0.4], roughness: mat.roughness ?? 0.8,
      metalness: mat.metalness ?? 0, emissive: mat.emissive?.toArray(), emissiveIntensity: mat.emissiveIntensity ?? 0,
      opacity: mat.opacity ?? 1, alphaTest: mat.alphaTest ?? 0,
      map: texture(mat.map), bump: texture(mat.bumpMap), bumpScale: mat.bumpScale ?? 0,
      semantic: mat.userData.colabSemantic || null
    };
    return mat.uuid;
  };
  const geometry = (geo) => {
    if (!output.geometries[geo.uuid]) {
      const attr = name => geo.getAttribute(name) ? Array.from(geo.getAttribute(name).array) : null;
      output.geometries[geo.uuid] = {position: attr('position'), normal: attr('normal'), uv: attr('uv'), index: geo.index ? Array.from(geo.index.array) : null, groups: geo.groups};
    }
    return geo.uuid;
  };
  const temp = new T.Matrix4();
  const world = new T.Matrix4();
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isReflector || mesh.material?.isShaderMaterial) return;
    let ancestor = mesh, core = false;
    while (ancestor && ancestor !== scene) { core ||= acceptedRoots.has(ancestor.name); ancestor = ancestor.parent; }
    const isBotanical = mesh.name.startsWith('botanical-');
    if (!core && !isBotanical && mesh.parent !== scene) return;
    if (mesh.geometry.type === 'CircleGeometry' && mesh.geometry.parameters.radius > 100) return;
    const matrices = [];
    const colors = [];
    const accept = matrix => core || (Math.abs(matrix.elements[12]) < 18 && Math.abs(matrix.elements[14]) < 22 && matrix.elements[13] < 18);
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, temp); world.multiplyMatrices(mesh.matrixWorld, temp);
        if (accept(world)) {
          matrices.push(world.toArray());
          if (mesh.instanceColor) {const color = new T.Color(); mesh.getColorAt(i, color); colors.push(color.toArray());}
        }
      }
    } else if (accept(mesh.matrixWorld)) matrices.push(mesh.matrixWorld.toArray());
    if (!matrices.length) return;
    output.objects.push({name: mesh.name || mesh.parent?.name || 'detail', geometry: geometry(mesh.geometry), materials: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material), matrices, colors});
  });
  return output;
}

export async function saveCourtyard(scene, architecture, status) {
  status.textContent = '正在整理院落模型与材质…';
  const payload = JSON.stringify(exportCourtyard(scene, architecture));
  const response = await fetch('./_scene', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: payload});
  if (!response.ok) throw new Error('请通过配套本地服务器导出场景');
  const result = await response.json();
  status.textContent = `院落模型已准备 · ${(result.bytes / 1024 / 1024).toFixed(1)} MB`;
}
