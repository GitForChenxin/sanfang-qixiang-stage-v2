// Export the same web geometry for a focused Blender inspection, with vertex/instance colours.
import * as T from '../three.module.min.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const code=(await fs.readFile(path.join(root,'heart-tree.mjs'),'utf8')).replace("from 'three'",`from '${pathToFileURL(path.join(root,'three.module.min.js')).href}'`);
const {createHeartBanyan}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const tree=createHeartBanyan({lod:false}); tree.object.updateMatrixWorld(true);
const meshes=[];
tree.object.traverse(o=>{
  if(!o.isMesh)return;
  const geometry=o.geometry;
  const attributes={};
  for(const name of ['position','normal','color']) if(geometry.attributes[name]) attributes[name]=Array.from(geometry.attributes[name].array);
  const matrices=[],colours=[];
  if(o.isInstancedMesh){
    const m=new T.Matrix4(),c=new T.Color();
    for(let i=0;i<o.count;i++){
      o.getMatrixAt(i,m);m.premultiply(o.matrixWorld);matrices.push(...m.elements);
      o.getColorAt(i,c);colours.push(...c.toArray());
    }
  }else matrices.push(...o.matrixWorld.elements);
  meshes.push({name:o.name,attributes,index:geometry.index?Array.from(geometry.index.array):null,matrices,colours,
    material:{color:o.material.color.toArray(),roughness:o.material.roughness}});
});
const bounds=new T.Box3().setFromObject(tree.object);
for(const mesh of meshes)for(const a of Object.values(mesh.attributes))if(!a.every(Number.isFinite))throw new Error('Invalid geometry');
const output={format:'sanfang-heart-v2',meta:tree.object.userData,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},meshes};
await fs.writeFile(path.join(root,'colab/heart-scene.json.gz'),gzipSync(JSON.stringify(output)));
console.log(JSON.stringify({meshes:meshes.length,leafInstances:tree.object.userData.leavesNear,bounds:output.bounds,bytes:(await fs.stat(path.join(root,'colab/heart-scene.json.gz'))).size}));
