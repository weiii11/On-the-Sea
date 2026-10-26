"""Build the complete, offline On the Sea page using only the standard library."""
from pathlib import Path
import json
import posixpath
import re

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'src'
modules = {}

for path in sorted(SOURCE.rglob('*.js')):
    relative = path.relative_to(SOURCE).as_posix()
    source = path.read_text(encoding='utf-8-sig')

    def rewrite(match):
        specifier = match.group(2)
        if specifier == 'three':
            target = 'vendor/three.module.js'
        elif specifier.startswith('three/addons/'):
            target = 'vendor/addons/' + specifier[len('three/addons/'):]
        elif specifier.startswith('.'):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(relative), specifier))
        else:
            return match.group(0)
        if not (SOURCE / target).is_file():
            raise FileNotFoundError(f'{relative} imports missing module {target}')
        return match.group(1) + json.dumps('on-the-sea/' + target)

    source = re.sub(r'''(\bfrom\s*|\bimport\s*)(?:['"])([^'"]+)(?:['"])''', rewrite, source)
    modules['on-the-sea/' + relative] = source

html = (SOURCE / 'index.html').read_text(encoding='utf-8-sig')
html = re.sub(r'<script type="importmap">.*?</script>', '', html, flags=re.S)
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>' + (SOURCE / 'style.css').read_text(encoding='utf-8-sig') + '</style>')
html = re.sub(r'<script type="module" src="\./app.js"></script>', '', html)
payload = json.dumps(modules, ensure_ascii=False).replace('</', '<\\/')
bootstrap = '<script>const sources=' + payload + ''';
const imports={};
for(const [key,source] of Object.entries(sources)) imports[key]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);
const entry=document.createElement('script');entry.type='module';entry.textContent='import "on-the-sea/app.js";';document.body.appendChild(entry);
</script>'''
license_text = (SOURCE / 'vendor' / 'THREE-LICENSE.txt').read_text(encoding='utf-8-sig')
html = html.replace('</body>', '<!-- Bundled Three.js license:\n' + license_text + '\n-->' + bootstrap + '</body>')
output = ROOT / 'index.html'
output.write_text(html, encoding='utf-8')
print(f'Built {output.name} ({output.stat().st_size:,} bytes; {len(modules)} modules)')
