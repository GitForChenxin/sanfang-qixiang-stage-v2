"""Validate and install the result downloaded from the Colab workshop."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent

def install(archive):
    target=ROOT/'colab'/'output'
    target.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        names=set(bundle.namelist())
        required={'render-report.json','sanfang-courtyard-v4.blend','assets/pbr/manifest.json','assets/renders/front.png','assets/renders/side.png'}
        assert required <= names, f'Missing outputs: {required-names}'
        report=json.loads(bundle.read('render-report.json'))
        assert report['gpu'] and report['resolution']==[1440,960]
        manifest=json.loads(bundle.read('assets/pbr/manifest.json'))
        assert set(manifest['materials'])=={'wood','lime','granite','roof','slate'}
        for group in manifest['materials'].values():
            for filename in group.values():
                assert 'assets/pbr/'+filename in names, filename
        for info in bundle.infolist():
            destination=(target/info.filename).resolve()
            assert destination.is_relative_to(target.resolve()), 'Unsafe archive path'
            if info.is_dir():continue
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(bundle.read(info))
    for group in manifest['materials'].values():
        for kind,filename in group.items():
            with Image.open(target/'assets/pbr'/filename) as image:
                assert image.size==(manifest['size'],manifest['size'])
                if kind=='normal':assert image.convert('RGB').getextrema()[2][0]>200, 'Invalid tangent-space normal'
    for view in ['front','side']:
        with Image.open(target/'assets/renders'/f'{view}.png') as image:
            assert image.size==(1440,960)
            assert any(high-low>30 for low,high in image.convert('RGB').getextrema()), 'Blank rendered view'
    shutil.copytree(target/'assets',ROOT/'assets',dirs_exist_ok=True)
    shutil.copyfile(target/'render-report.json',ROOT/'colab'/'render-report.json')
    print(json.dumps({'installed':True,'maps':15,'renderedViews':2,'gpu':report['gpu'],'meshInstances':report['meshInstances'],'editableModel':str(target/'sanfang-courtyard-v4.blend')},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive',type=Path)
    install(parser.parse_args().archive)
