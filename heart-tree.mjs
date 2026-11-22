import * as T from 'three';

// Reference-guided botanical illustration, not a surveyed reconstruction.
// The canopy is a closed 3D volume with individually curved leaves, not a leaf-card outline.
export function createHeartBanyan({height = 8.5, width = 8.2, depth = 5.4, seed = 350102, lod = true} = {}) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const signed = () => random() * 2 - 1;
  const root = new T.Group();
  root.name = 'heart-banyan-refined';
  const bottom = height * 0.355;
  const crownHeight = height - bottom;
  const middleY = bottom + crownHeight * 0.54;
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;

  // A full heart outline: two gently unequal lobes, a restrained upper cleft,
  // and a rounded lower point held well above the pavement.
  const outline = new T.Shape();
  outline.moveTo(-.045, 0.87);
  outline.bezierCurveTo(-0.34, 1.065, -0.86, 1.025, -0.98, 0.73);
  outline.bezierCurveTo(-1.085, 0.43, -0.40, 0.13, -.035, .035);
  outline.bezierCurveTo(.13, -.015, .46, .20, .73, .40);
  outline.bezierCurveTo(1.15, .71, .89, 1.115, .43, 1.02);
  outline.bezierCurveTo(.22, 1.015, .06, .91, -.045, .87);
  const boundary = outline.getSpacedPoints(192).slice(0, -1);
  const boundaryAt = angle => {
    const scaled = ((angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * boundary.length;
    const i = Math.floor(scaled), alpha = scaled - i;
    const point = boundary[i].clone().lerp(boundary[(i + 1) % boundary.length], alpha);
    const edge = Math.sin(angle * 13 + .7) * .055 + Math.sin(angle * 23 - 1.1) * .035;
    return new T.Vector2(point.x * halfWidth * (point.x < 0 ? .985 : 1.015) + edge,
      bottom + point.y * crownHeight + Math.sin(angle * 11) * .025);
  };
  const surface = (angle, radius, side) => {
    const p = boundaryAt(angle);
    const bulge = Math.pow(Math.max(0, 1 - radius * radius), .61);
    const uneven = Math.sin(angle*9+radius*29)*.065 + Math.sin(angle*17-radius*41)*.035;
    return new T.Vector3(p.x * radius + uneven*radius,
      middleY + (p.y - middleY) * radius + uneven*radius,
      side * (halfDepth * bulge * (.93 + .07 * Math.sin(angle * 5 + radius * 9)) + uneven*radius));
  };

  function barkTube(points, startRadius, endRadius, segments = 22, radial = 14) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, 'centripetal');
    const frames = curve.computeFrenetFrames(segments, false);
    const positions = [], colors = [], uv = [], indices = [];
    const bark = new T.Color(0x777366);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, center = curve.getPointAt(t);
      const taper = T.MathUtils.lerp(startRadius, endRadius, Math.pow(t, .73));
      for (let j = 0; j <= radial; j++) {
        const angle = j / radial * Math.PI * 2;
        const furrow = Math.sin(angle * 7 + t * 2.3) * .055 + Math.sin(angle * 17 - t * 11) * .023;
        const radius = taper * (1 + furrow);
        const offset = frames.normals[i].clone().multiplyScalar(Math.cos(angle) * radius)
          .addScaledVector(frames.binormals[i], Math.sin(angle) * radius);
        const point = center.clone().add(offset);
        positions.push(point.x, point.y, point.z);
        const variation = .92 + .07 * Math.sin(angle * 7 + t * 2.3) + .035 * Math.sin(t * 35 + angle * 3);
        colors.push(bark.r * variation, bark.g * variation, bark.b * variation);
        uv.push(j / radial, t * curve.getLength());
      }
    }
    for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  function mergeGeometries(parts) {
    const attributes = {position: [], normal: [], color: [], uv: []};
    for (const part of parts) {
      const flat = part.index ? part.toNonIndexed() : part;
      for (const name of Object.keys(attributes)) {
        const array = flat.getAttribute(name)?.array;
        if (array) for (let i = 0; i < array.length; i++) attributes[name].push(array[i]);
      }
      if (flat !== part) flat.dispose();
      part.dispose();
    }
    const merged = new T.BufferGeometry();
    for (const [name, values] of Object.entries(attributes)) if (values.length) merged.setAttribute(name, new T.Float32BufferAttribute(values, name === 'uv' ? 2 : 3));
    merged.computeBoundingSphere();
    return merged;
  }

  const scale = height / 8.5;
  const trunkOffset = 1.05 * scale;
  const scaled = points => points.map(([x,y,z]) => [(x+1.05*Math.max(0,1-y/6.7))*scale,y*scale,z*scale]);
  const branchParts = [];
  branchParts.push(barkTube(scaled([[.06,.02,.02],[-.13,.85,.02],[-.10,1.7,-.03],[.06,2.65,.04],[.12,3.2,.0]]),.48*scale,.27*scale,32,20));
  const primary = [
    [[-.03,2.08,.03],[-.65,3.25,.04],[-1.5,4.35,.14],[-2.85,6.4,.24]],
    [[.03,2.30,-.03],[.78,3.43,-.07],[1.74,4.61,-.22],[2.92,6.48,-.20]],
    [[.1,2.55,.0],[.25,3.75,-.48],[-.18,5.05,-.94],[-.75,6.65,-.91]],
    [[.0,2.72,.0],[-.42,3.87,.51],[-.73,4.78,.86],[-1.48,6.10,.72]],
    [[.14,2.91,.0],[.68,3.95,.50],[1.25,4.90,.74],[1.96,6.20,.58]]
  ];
  primary.forEach((points,i) => {
    branchParts.push(barkTube(scaled(points),(.28-i*.022)*scale,.042*scale,26,14));
    const a = points[2];
    for (let j = 0; j < 3; j++) {
      const sign = i % 2 ? 1 : -1;
      const end = [a[0]+sign*(.45+j*.28),a[1]+.75+j*.40,a[2]+signed()*.85];
      branchParts.push(barkTube(scaled([a,[(a[0]+end[0])*.5,a[1]+.4,(a[2]+end[2])*.5],end]),(.055+j*.004)*scale,.009*scale,12,8));
    }
  });
  for (let i = 0; i < 9; i++) {
    const angle = i / 9 * Math.PI * 2 + signed()*.14;
    const reach = .72 + random()*.42;
    branchParts.push(barkTube(scaled([[.0,.55,.0],[Math.cos(angle)*.36,.19,Math.sin(angle)*.36],[Math.cos(angle)*reach,.035,Math.sin(angle)*reach]]),.14*scale,.025*scale,14,10));
  }
  // Sparse aerial roots fall beside the trunk, rather than making a curtain across the street.
  for (let i = 0; i < 7; i++) {
    const sign = i % 2 ? 1 : -1;
    const x = sign*(.55+random()*.7), z = -.35+random()*.7;
    const top = 3.8+random()*.7, low = 1.25+random()*1.1;
    branchParts.push(barkTube(scaled([[x,top,z],[x+.04,top-.8,z+.015],[x+.08,low,z+.06]]),.016*scale,.006*scale,16,5));
  }
  const barkMaterial = new T.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.96});
  barkMaterial.name='banyan-weathered-bark';
  const branches = new T.Mesh(mergeGeometries(branchParts),barkMaterial);
  branches.name='heart-banyan-trunk-and-branches'; branches.castShadow=true; branches.receiveShadow=true;
  root.add(branches);

  // Closed front/back canopy shell provides the continuous interior leaf mass.
  const positions=[], colors=[], indices=[];
  const rings=14, slices=144;
  const coreGreen=new T.Color(0x36592b);
  for (const side of [1,-1]) for(let r=0;r<=rings;r++) for(let s=0;s<=slices;s++) {
    const a=s/slices*Math.PI*2, radius=r/rings;
    const p=surface(a,radius,side);
    const variation=.91+.10*Math.sin(a*7+radius*17)+.045*Math.sin(a*23-radius*43);
    positions.push(p.x,p.y,p.z);
    colors.push(coreGreen.r*variation,coreGreen.g*variation,coreGreen.b*variation);
  }
  const half=(rings+1)*(slices+1);
  for(let side=0;side<2;side++) for(let r=0;r<rings;r++) for(let s=0;s<slices;s++) {
    const a=side*half+r*(slices+1)+s,b=a+slices+1;
    if(side===0)indices.push(a,b,a+1,a+1,b,b+1); else indices.push(a,a+1,b,a+1,b+1,b);
  }
  const coreGeometry=new T.BufferGeometry();
  coreGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  coreGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  coreGeometry.setIndex(indices);coreGeometry.computeVertexNormals();
  const core=new T.Mesh(coreGeometry,new T.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.94,side:T.DoubleSide}));
  core.name='heart-banyan-continuous-canopy';core.castShadow=true;core.receiveShadow=true;root.add(core);

  // Curved leaf blade: pointed tip, arched central vein, and turned-down edges.
  const leafPositions=[0,0,0,-.39,.22,0,0,.22,.075,.39,.22,0,-.50,.56,-.025,0,.56,.105,.50,.56,-.025,-.26,.84,-.025,0,.84,.06,.26,.84,-.025,0,1,.01];
  const leafIndices=[0,1,2,0,2,3,1,4,2,2,4,5,2,5,3,3,5,6,4,7,5,5,7,8,5,8,6,6,8,9,7,10,8,8,10,9];
  const leafGeometry=new T.BufferGeometry();
  leafGeometry.setAttribute('position',new T.Float32BufferAttribute(leafPositions,3));
  leafGeometry.setIndex(leafIndices);leafGeometry.computeVertexNormals();
  const leafColors=[];
  for(let i=0;i<leafPositions.length;i+=3) {
    const vein=Math.abs(leafPositions[i])<.01?1.08:.93;
    const shade=(.86+leafPositions[i+1]*.14)*vein;
    leafColors.push(shade,shade,shade*.97);
  }
  leafGeometry.setAttribute('color',new T.Float32BufferAttribute(leafColors,3));
  const leafMaterial=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.73,side:T.DoubleSide});
  leafMaterial.name='banyan-individual-curved-leaves';
  const wind={value:0};
  leafMaterial.onBeforeCompile=shader=>{
    shader.uniforms.heartWind=wind;
    shader.vertexShader='uniform float heartWind;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      transformed.x += sin(heartWind*1.4+instanceMatrix[3].x*1.8+instanceMatrix[3].y*.7)*.045*position.y*position.y;
      #endif`);
  };
  leafMaterial.customProgramCacheKey=()=> 'heart-banyan-wind-v1';
  const total=26000, dummy=new T.Object3D(), zAxis=new T.Vector3(0,0,1), xAxis=new T.Vector3(1,0,0);
  const transforms=[], tints=[];
  const clusters=520, perCluster=total/clusters;
  for(let c=0;c<clusters;c++) {
    const angle=random()*Math.PI*2, radius=Math.sqrt(random())*.985, side=c%2?1:-1;
    const center=surface(angle,radius,side);
    const normal=new T.Vector3(center.x/halfWidth*.5,(center.y-middleY)/crownHeight*.7,side*1.3).normalize();
    const clusterShade=.89+random()*.21;
    for(let j=0;j<perCluster;j++) {
      const p=center.clone().add(new T.Vector3(signed()*.24,signed()*.22,signed()*.20));
      dummy.position.copy(p);
      dummy.quaternion.setFromUnitVectors(zAxis,normal);
      dummy.quaternion.multiply(new T.Quaternion().setFromAxisAngle(zAxis,random()*Math.PI*2));
      dummy.quaternion.multiply(new T.Quaternion().setFromAxisAngle(xAxis,signed()*1.0));
      const length=(.095+random()*.072)*scale;
      dummy.scale.set(length*(.60+random()*.24),length,length);
      dummy.updateMatrix();transforms.push(dummy.matrix.clone());
      const tint=new T.Color().setHSL(.255+random()*.038,.35+random()*.16,(.30+random()*.11)*clusterShade);
      tints.push(tint);
    }
  }
  const levels = new T.LOD();levels.name='heart-banyan-leaf-lod';
  for(const [count,distance] of (lod?[[26000,0],[7800,35],[1500,85]]:[[26000,0]])) {
    const mesh=new T.InstancedMesh(leafGeometry,leafMaterial,count);
    mesh.name=`heart-banyan-leaves-${count}`;mesh.castShadow=count>2000;mesh.receiveShadow=true;
    // Interleaving all clusters preserves both lobes and the filled centre at every LOD.
    for(let i=0;i<count;i++) {
      const at=Math.floor(i*total/count);mesh.setMatrixAt(i,transforms[at]);mesh.setColorAt(i,tints[at]);
    }
    mesh.computeBoundingSphere();levels.addLevel(mesh,distance);
  }
  root.add(levels);
  // A low stone tree well sits flush with the paving; the buttress roots remain visible.
  const treeWell=new T.Mesh(new T.RingGeometry(.78*scale,1.12*scale,56),new T.MeshStandardMaterial({color:0xaaa99f,roughness:.93,side:T.DoubleSide}));
  treeWell.rotation.x=-Math.PI/2;treeWell.position.set(trunkOffset,.025,0);treeWell.name='heart-banyan-tree-well';treeWell.receiveShadow=true;root.add(treeWell);
  root.userData={version:'aerial-reference-banyan-v2',height,width,depth,seed,leavesNear:26000,leavesMid:7800,leavesFar:1500,canopyBottom:bottom,trunkOffset,illustrative:true};
  return {object:root,update:time=>{wind.value=time;},lod:levels};
}
