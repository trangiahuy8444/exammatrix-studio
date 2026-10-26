"""Render app exports without changing them; record failures and all-page previews."""
from pathlib import Path
import io
import json
import os
import re
import shutil
import subprocess
import zipfile
from docx import Document
from PIL import Image, ImageDraw
import fitz

OUT=Path(__file__).resolve().parent
EXPORT=OUT/'exports'
result={'word':[],'latex':[],'pdf':[]}
def save(): (OUT/'render_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
wordpdf=EXPORT/'pdf_from_word';wordpdf.mkdir(exist_ok=True)
texpdf=EXPORT/'pdf_from_xelatex';texpdf.mkdir(exist_ok=True)
docxs=sorted((EXPORT/'docx').rglob('*.docx'))
for path in docxs:
    doc=Document(path)
    widths=[]
    for table in doc.tables:
        widths.append(round(sum(c.width or 0 for c in table.columns)/360000,3))
    with zipfile.ZipFile(path) as z: xml=z.read('word/document.xml').decode()
    result['word'].append({'file':str(path.relative_to(OUT)),'tables':len(doc.tables),
        'table_widths_cm':widths,'repeat_header_count':xml.count('<w:tblHeader'),
        'literal_latex':bool(re.search(r'\$[^$]+\$',xml)),
        'sections':[{'width_cm':round(s.page_width/360000,3),'height_cm':round(s.page_height/360000,3),
          'left_cm':round(s.left_margin/360000,3),'right_cm':round(s.right_margin/360000,3)} for s in doc.sections]})
cmd=['soffice','-env:UserInstallation=file:///private/tmp/exammatrix-vatly10-office-profile',
     '--headless','--convert-to','pdf','--outdir',str(wordpdf)]+list(map(str,docxs))
proc=subprocess.run(cmd,capture_output=True,text=True,timeout=180)
(OUT/'office_render.log').write_text(proc.stdout+'\n'+proc.stderr)
result['office']={'returncode':proc.returncode,'expected':len(docxs),'actual':len(list(wordpdf.glob('*.pdf')))}
save()
for path in sorted((EXPORT/'tex').rglob('*.tex')):
    build=EXPORT/'_latex_build'/path.stem;build.mkdir(parents=True,exist_ok=True)
    logs=[];success=True
    for i in range(2):
        proc=subprocess.run(['/Library/TeX/texbin/xelatex','-no-shell-escape','-interaction=nonstopmode',
            '-halt-on-error','-output-directory',str(build),str(path)],capture_output=True,text=True,timeout=90)
        logs.append(proc.stdout+'\n'+proc.stderr)
        if proc.returncode: success=False;break
    (build/'compiler_output.txt').write_text('\n'.join(logs))
    warnings=[line for line in logs[-1].splitlines() if any(s in line for s in ['Overfull','Missing character','Undefined control','LaTeX Error'])]
    if success: shutil.copy2(build/(path.stem+'.pdf'),texpdf/(path.stem+'.pdf'))
    result['latex'].append({'file':str(path.relative_to(OUT)),'success':success,'warnings':warnings,
         'last_output':logs[-1][-1800:] if not success else ''})
    print('LATEX',success,path.name,flush=True);save()

thumbdir=OUT/'previews';thumbdir.mkdir(exist_ok=True)
for folder in [wordpdf,texpdf]:
    for path in sorted(folder.glob('*.pdf')):
        doc=fitz.open(path)
        thumbs=[];pages=[]
        for i,page in enumerate(doc):
            pix=page.get_pixmap(matrix=fitz.Matrix(.7,.7),alpha=False)
            im=Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
            # Each preview is available individually as well as in a contact sheet.
            name=folder.name+'_'+path.stem+f'_p{i+1:02}'
            im.save(thumbdir/(name+'.png'))
            thumb=im.copy();thumb.thumbnail((370,520))
            tile=Image.new('RGB',(390,555),'#d8d8d8');tile.paste(thumb,((390-thumb.width)//2,25))
            ImageDraw.Draw(tile).text((10,535),f'Page {i+1}/{len(doc)}',fill='black');thumbs.append(tile)
            words=page.get_text('words'); rect=page.rect
            outside=[w[4] for w in words if w[0]<-1 or w[1]<-1 or w[2]>rect.width+1 or w[3]>rect.height+1]
            pages.append({'page':i+1,'width_pt':rect.width,'height_pt':rect.height,'outside_page_words':outside})
        cols=min(3,len(thumbs));rows=(len(thumbs)+cols-1)//cols
        sheet=Image.new('RGB',(cols*390,rows*555),'white')
        for i,thumb in enumerate(thumbs):sheet.paste(thumb,((i%cols)*390,(i//cols)*555))
        sheet.save(thumbdir/(folder.name+'_'+path.stem+'_ALL.png'))
        result['pdf'].append({'file':str(path.relative_to(OUT)),'pages':pages,'text':''.join(p.get_text() for p in doc)})
        print('PDF',len(doc),path.name,flush=True);save()
save()
