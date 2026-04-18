import sys, re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import truststore; truststore.inject_into_ssl()
from dotenv import load_dotenv; load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

from core.ts_creation import render_ts_docx, extract_placeholders, docx_to_preview_html

tpl = Path(__file__).parent.parent / "data" / "TS_WRICEF ID_Description v1.0 - AITemplate 1.docx"
phs = extract_placeholders(tpl)
vals = {p: f"[T]" for p in phs}
docx = render_ts_docx(vals, tpl)
html = docx_to_preview_html(docx)

classes = sorted(set(re.findall(r'class="([^"]+)"', html)))
print("All classes:", classes)
print("ts-doc-h in html:", "ts-doc-h" in html)
print("h tags:", any(f"<h{i}" in html for i in range(1,7)))
# Print first 1000 chars of html
print("\nFirst 500 chars of HTML:")
print(html[:500])
