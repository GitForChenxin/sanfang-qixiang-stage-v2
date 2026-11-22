from pathlib import Path
import json
import zipfile

root=Path(__file__).resolve().parent.parent
setup='''#@title 1. 连接 GPU、上传工程并准备 Blender（第一次运行）
from pathlib import Path
from google.colab import files
import subprocess, zipfile, urllib.request, re, hashlib, tarfile
BASE=Path('/content/sanfang-workshop')
BASE.mkdir(exist_ok=True)
def checked(command, cwd=None):
    result=subprocess.run(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    if result.returncode:
        print(result.stdout[-8000:])
        raise RuntimeError('步骤失败，请查看上方日志')
    return result.stdout
print(checked(['nvidia-smi','--query-gpu=name,memory.total,driver_version','--format=csv']))
print('请选择 sanfang-input.zip 工程包。')
uploaded=files.upload()
archives=[name for name in uploaded if name.endswith('.zip')]
assert len(archives)==1, '请仅上传一份 sanfang-input.zip'
with zipfile.ZipFile(archives[0]) as bundle:
    for entry in bundle.infolist():
        path=(BASE/entry.filename).resolve()
        assert path.is_relative_to(BASE.resolve()), '工程包包含非法路径'
    bundle.extractall(BASE)
print('安装原生 Canvas2D 和中文字体，用现有工程精确重建几何与原贴图…',flush=True)
checked(['apt-get','-qq','update'])
checked(['apt-get','-qq','install','-y','nodejs','npm','fonts-noto-cjk','libx11-6','libxi6','libxrender1','libxfixes3','libxkbcommon0','libsm6','libice6','libgl1','libegl1','libgomp1'])
print(checked(['npm','install','--ignore-scripts','--no-audit','--no-fund'],cwd=BASE)[-1200:])
print(checked(['node','colab/export-offline.mjs'],cwd=BASE))
listing=urllib.request.urlopen('https://download.blender.org/release/Blender4.5/',timeout=60).read().decode()
packages=set(re.findall(r'blender-4\\.5\\.\\d+-linux-x64\\.tar\\.xz',listing))
package=max(packages,key=lambda name:int(name.split('-')[1].split('.')[2]))
version=package.split('-')[1]
runtime=Path('/content/blender_runtime'); runtime.mkdir(exist_ok=True)
BLENDER=str(runtime/package.removesuffix('.tar.xz')/'blender')
if not Path(BLENDER).exists():
    print('下载官方 Blender：',package,flush=True)
    archive=runtime/package
    urllib.request.urlretrieve('https://download.blender.org/release/Blender4.5/'+package,archive)
    sums=urllib.request.urlopen('https://download.blender.org/release/Blender4.5/blender-'+version+'.sha256',timeout=60).read().decode()
    expected=next(line.split()[0] for line in sums.splitlines() if package in line)
    with archive.open('rb') as handle: actual=hashlib.file_digest(handle,'sha256').hexdigest()
    assert actual==expected, 'Blender 安装包校验失败'
    with tarfile.open(archive) as bundle: bundle.extractall(runtime,filter='data')
    archive.unlink()
print(checked([BLENDER,'--version']).splitlines()[0])
print(checked(['python','colab/pipeline.py','--materials'],cwd=BASE))
print('准备完成：原始院落模型已导入，15 张材质贴图已生成。')
'''
render='''#@title 2. 用云端 GPU 渲染原院落（两张 1440×960 光影预览）
import subprocess, time
from IPython.display import display, Image
started=time.time()
print('开始转换院落模型并渲染，通常需要几分钟…',flush=True)
result=subprocess.run([BLENDER,'--background','--factory-startup','--python-exit-code','1','--python',str(BASE/'colab/pipeline.py'),'--','--render'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(BASE/'result').mkdir(exist_ok=True)
(BASE/'result'/'pipeline.log').write_text(result.stdout,encoding='utf-8')
for line in result.stdout.splitlines():
    if any(key in line for key in ['GPU_RENDER_DEVICE','IMPORTED_ORIGINAL_GEOMETRY','RENDER_START','RENDER_DONE','SANFANG_RENDER_SUCCESS']): print(line)
if 'SANFANG_RENDER_SUCCESS' not in result.stdout:
    print(result.stdout[-8000:])
    raise RuntimeError('渲染失败，详细日志已保存')
print(f'完成，总耗时 {time.time()-started:.1f} 秒。')
for name in ['front','side']:
    print('隔池正看' if name=='front' else '池岸斜看')
    display(Image(filename=str(BASE/'result/assets/renders'/f'{name}.png'),width=1000))
'''
download='''#@title 3. 下载材质、预览图与可编辑 Blender 工程
from pathlib import Path
from google.colab import files
import zipfile, json
result=BASE/'result'
assert (result/'render-report.json').exists(), '请先完成第 2 格渲染'
archive=Path('/content/sanfang-colab-v4-result.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
    for path in result.rglob('*'):
        if path.is_file() and not path.name.endswith('.blend1'): bundle.write(path,path.relative_to(result))
print((result/'render-report.json').read_text(encoding='utf-8'))
print('成果已打包，下载后可将 assets 文件夹合并到优化版工程。')
print('请保存下载文件。用完可在“代码执行程序”菜单断开并删除运行时，释放算力。')
files.download(str(archive))
'''
def cell(kind,text):
    entry={'cell_type':kind,'metadata':{},'source':text.splitlines(True)}
    if kind=='code':entry.update(execution_count=None,outputs=[])
    return entry
notebook={'nbformat':4,'nbformat_minor':5,'metadata':{'colab':{'name':'三坊七巷-Colab画质工坊.ipynb','provenance':[]},'kernelspec':{'name':'python3','display_name':'Python 3'},'accelerator':'GPU'},'cells':[
    cell('markdown','# 三坊七巷 · Colab 画质工坊\n\n使用工程原有院落几何与贴图，生成五组 PBR 材质和两张 Cycles 光影预览。\n\n1. 运行时选择 **T4 GPU**。\n2. 依次运行三格，第一格选择 `sanfang-input.zip`。\n3. 下载成果并保存，用完释放 GPU。\n\n模型来自现有 V3-GIS 工程，仍属人工示意，未增加实测或扫描依据；照片出处与授权见原工程 SOURCES.md。'),
    cell('code',setup),cell('code',render),cell('code',download)]}
destination=root/'colab'/'sanfang-visual-workshop.ipynb'
destination.write_text(json.dumps(notebook,ensure_ascii=False,indent=1),encoding='utf-8')
files=['renderer.mjs','model.mjs','three.module.min.js','three.core.min.js','Reflector.js','colab-export.mjs','visual-quality.mjs','heart-tree.mjs','package.json','THREE-LICENSE','SOURCES.md','data/district-osm.json','colab/export-offline.mjs','colab/pipeline.py']
with zipfile.ZipFile(root/'colab'/'sanfang-input.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for name in files:bundle.write(root/name,name)
print('Created',destination)
print('Input bundle bytes:',(root/'colab'/'sanfang-input.zip').stat().st_size)
