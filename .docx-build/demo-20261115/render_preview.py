from pathlib import Path
import importlib.util, tempfile, shutil, json
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw

root=Path(r'C:\Users\Xuân Hoàng\Desktop\Website')
build=root/'.docx-build/demo-20261115'
out=build/'render'
out.mkdir(exist_ok=True)
temp=build/'temp'
temp.mkdir(exist_ok=True)
tempfile.tempdir=str(temp)
skill=Path(r'C:\Users\Xuân Hoàng\.codex\plugins\cache\openai-primary-runtime\documents\26.1112.11217\skills\documents')
spec=importlib.util.spec_from_file_location('docx_renderer',skill/'render_docx.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
pdf=build/'word-preview.pdf'
def word_pdf(*args,**kwargs):
    return str(pdf),'Converted with installed Microsoft Word because LibreOffice is unavailable.'
mod.convert_to_pdf=word_pdf
# Keep the skill rasterization path, substituting only Word's native PDF converter.
mod.rasterize(str(root/'outputs/Kich_ban_thuyet_trinh_va_demo_AnhTraiStore.docx'),str(out),120,False,False)
document=PdfReader(str(pdf))
expected=json.loads((build/'expected-pages.json').read_text(encoding='utf-8'))
report=[]
for i,page in enumerate(document.pages):
    text=page.extract_text()
    report.append({'page':i+1,'chars':len(text),'start':text[:180].replace('\n',' '),'last':text[-120:].replace('\n',' ')})
(build/'page-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
imgs=sorted(out.glob('page-*.png'),key=lambda p:int(p.stem.split('-')[-1]))
for start in range(0,len(imgs),6):
    thumbs=[]
    for f in imgs[start:start+6]:
        im=Image.open(f).convert('RGB');im.thumbnail((360,510))
        thumb=Image.new('RGB',(380,550),'#e6e6e6')
        thumb.paste(im,((380-im.width)//2,25))
        ImageDraw.Draw(thumb).text((14,530),f.stem,fill='black')
        thumbs.append(thumb)
    sheet=Image.new('RGB',(380*3,550*2),'white')
    for j,im in enumerate(thumbs):sheet.paste(im,((j%3)*380,(j//3)*550))
    sheet.save(build/f'montage-{start//6+1}.png')
print(json.dumps({'pages':len(document.pages),'planned':len(expected['pages']),'pngs':len(imgs),'audit':report},ensure_ascii=False))
