"""Create the Git-ref based Colab entrypoint without manual source ZIP uploads."""
from pathlib import Path
import json
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def cell(kind, text):
    result = {"cell_type": kind, "metadata": {}, "source": textwrap.dedent(text).strip().splitlines(True)}
    if kind == "code":
        result.update(execution_count=None, outputs=[])
    return result


cells = [cell("markdown", """
    # 三坊七巷 · GitHub → Colab GPU → 云端网页
    这是独立的可复现渲染入口，不修改已有 Colab 工作坊。
    1. 在运行时设置中选择可用的 NVIDIA GPU；检查计算单位和预计运行时间。
    2. 设置要渲染的 Git ref；首次可以用云端基础设施分支，正式交付建议填提交 SHA。
    3. 顺序运行三个代码单元，下载结果；使用仓库里的 `colab/import_result.py` 校验后更新 assets。
    当前渲染器负责水榭戏台院落。爱心树使用仓库单独的 export-heart.mjs/render-heart.py，不能把院落结果当作爱心树验收。
    Colab 需要独立登录及可用算力；这个笔记本不是 Codex 自动获得的 Colab API。
    模型为人工示意构建，非实景扫描；来源与许可见 SOURCES.md。
    """), cell("code", r'''
    #@title 1. 从 GitHub 获取明确版本，并准备 GPU 与 Blender
    REPOSITORY = "https://github.com/GitForChenxin/sanfang-qixiang-stage-v2.git"
    GIT_REF = "infra/codex-cloud-run" #@param {type:"string"}
    from pathlib import Path
    import subprocess, urllib.request, re, hashlib, tarfile, json
    BASE = Path('/content/sanfang-workshop')
    def checked(command, cwd=None):
        completed = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        if completed.returncode:
            print(completed.stdout[-10000:])
            raise RuntimeError('Command failed: ' + str(command[0]))
        return completed.stdout
    print(checked(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv']))
    if not (BASE / '.git').exists():
        checked(['git','clone','--no-checkout',REPOSITORY,str(BASE)])
    checked(['git','fetch','origin',GIT_REF], cwd=BASE)
    if checked(['git','status','--porcelain'], cwd=BASE).strip():
        raise RuntimeError('Workspace has changes; save them before switching Git ref.')
    checked(['git','checkout','--detach','FETCH_HEAD'], cwd=BASE)
    SOURCE_COMMIT = checked(['git','rev-parse','HEAD'], cwd=BASE).strip()
    print('SOURCE_COMMIT:', SOURCE_COMMIT)
    checked(['apt-get','-qq','update'])
    checked(['apt-get','-qq','install','-y','nodejs','npm','fonts-noto-cjk','libx11-6','libxi6','libxrender1','libxfixes3','libxkbcommon0','libsm6','libice6','libgl1','libegl1','libgomp1'])
    checked(['python','-m','pip','install','-q','-r','requirements-dev.txt'], cwd=BASE)
    checked(['npm','ci','--ignore-scripts','--no-audit','--no-fund'], cwd=BASE)
    print(checked(['node','colab/export-offline.mjs'], cwd=BASE))
    listing = urllib.request.urlopen('https://download.blender.org/release/Blender4.5/', timeout=60).read().decode()
    packages = set(re.findall(r'blender-4\.5\.\d+-linux-x64\.tar\.xz', listing))
    package = max(packages, key=lambda n:int(n.split('-')[1].split('.')[2]))
    version = package.split('-')[1]
    runtime = Path('/content/blender_runtime'); runtime.mkdir(exist_ok=True)
    BLENDER = str(runtime / package.removesuffix('.tar.xz') / 'blender')
    if not Path(BLENDER).exists():
        archive = runtime / package
        urllib.request.urlretrieve('https://download.blender.org/release/Blender4.5/' + package, archive)
        sums = urllib.request.urlopen('https://download.blender.org/release/Blender4.5/blender-' + version + '.sha256', timeout=60).read().decode()
        expected = next(line.split()[0] for line in sums.splitlines() if package in line)
        with archive.open('rb') as handle:
            actual = hashlib.file_digest(handle,'sha256').hexdigest()
        assert actual == expected, 'Blender archive SHA256 mismatch'
        with tarfile.open(archive) as bundle:
            bundle.extractall(runtime, filter='data')
        archive.unlink()
    print(checked([BLENDER,'--version']).splitlines()[0])
    print(checked(['python','colab/pipeline.py','--materials'], cwd=BASE))
    '''), cell("code", r'''
    #@title 2. GPU 渲染院落；保留明确的源代码版本
    from IPython.display import display, Image
    import time
    start = time.time()
    log = checked([BLENDER,'--background','--factory-startup','--python-exit-code','1','--python',str(BASE/'colab/pipeline.py'),'--','--render'], cwd=BASE)
    result = BASE / 'result'; result.mkdir(exist_ok=True)
    (result/'pipeline.log').write_text(log, encoding='utf-8')
    assert 'SANFANG_RENDER_SUCCESS' in log, 'Renderer did not report success'
    report = json.loads((result/'render-report.json').read_text())
    report['sourceCommit'] = SOURCE_COMMIT
    (result/'render-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    print('Elapsed seconds:',round(time.time()-start,1))
    for name in ['front','side']:
        display(Image(filename=str(result/f'assets/renders/{name}.png'),width=900))
    '''), cell("code", r'''
    #@title 3. 下载结果；确认保存后在运行时菜单断开 GPU
    from google.colab import files
    import zipfile
    archive = Path('/content/sanfang-colab-result.zip')
    assert (result/'render-report.json').exists()
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
        for item in result.rglob('*'):
            if item.is_file() and item.suffix != '.blend1':
                bundle.write(item,item.relative_to(result))
    print('Source commit:',SOURCE_COMMIT,'Archive bytes:',archive.stat().st_size)
    files.download(str(archive))
    ''')]
notebook = {"nbformat": 4, "nbformat_minor": 5,
            "metadata": {"colab": {"name": "三坊七巷-云端渲染.ipynb", "provenance": []},
                         "kernelspec": {"name": "python3", "display_name": "Python 3"}, "accelerator": "GPU"},
            "cells": cells}
target = ROOT / "colab/cloud-workshop.ipynb"
target.write_text(json.dumps(notebook,ensure_ascii=False,indent=1),encoding="utf-8")
print(target.name)
