import zipfile, re, io, sys
path = r"c:\Users\V.Divvela\OneDrive - Shell\Documents\ML\Open AI\FASTAPI_AI_Tool\data\TS_WRICEF ID_Description v1.0 - AITemplate 1.docx"
try:
    with open(path, "rb") as f:
        data = f.read()
    print(f"Read {len(data)} bytes OK")
    all_text = ""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if name.endswith(".xml"):
                all_text += z.read(name).decode("utf-8", errors="replace")
    placeholders = sorted(set(re.findall(r"\{\{([^}]+)\}\}", all_text)))
    print(f"Found {len(placeholders)} placeholders:")
    for p in placeholders:
        print(f"  {{{{{p}}}}}")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback; traceback.print_exc()
