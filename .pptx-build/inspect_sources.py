from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import re, json
from docx import Document

base=Path(r'C:\Users\Xuân Hoàng\Desktop\067205000731_Trương Xuân Hoàng_TTTN')
files=[base/'067205000731_Trương Xuân Hoàng_Báo Cáo TTTN.docx',
       base/'067205000731_Trương Xuân Hoàng_TTTN'/'067205000731_Trương Xuân Hoàng_Báo Cáo TTTN.docx']
for file in files:
    d=Document(file)
    headings=[(p.style.name,p.text.strip()) for p in d.paragraphs if p.text.strip() and ('Heading' in p.style.name or 'Tiêu đề' in p.style.name)]
    pages=[p.text.strip() for p in d.paragraphs if p.text.strip()]
    print(json.dumps({'file':str(file),'bytes':file.stat().st_size,'modified':file.stat().st_mtime,
      'paragraphs':len(d.paragraphs),'tables':len(d.tables),'images':len(d.inline_shapes),'headings':headings[:120],
      'opening':pages[:35]},ensure_ascii=False,indent=2))

ppt=base/'067205000731_Trương Xuân Hoàng_Báo Cáo TTTN.pptx'
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
with ZipFile(ppt) as z:
    slides=sorted([n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)],key=lambda n:int(re.search(r'slide(\d+)',n).group(1)))
    report=[]
    for i,name in enumerate(slides,1):
        root=ET.fromstring(z.read(name))
        shapes=[]
        for sp in root.findall('.//p:sp',ns):
            c=sp.find('./p:nvSpPr/p:cNvPr',ns)
            texts=[n.text or '' for n in sp.findall('.//a:t',ns)]
            if texts:shapes.append({'name':c.attrib.get('name') if c is not None else '', 'text':' '.join(texts)})
        note_name=f'ppt/notesSlides/notesSlide{i}.xml'
        notes=[]
        if note_name in z.namelist():notes=[n.text or '' for n in ET.fromstring(z.read(note_name)).findall('.//a:t',ns)]
        report.append({'slide':i,'shapes':shapes,'notes':notes})
    print(json.dumps({'pptx':str(ppt),'slide_count':len(slides),'slides':report},ensure_ascii=False,indent=2))
