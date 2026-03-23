import difflib


def compute_side_by_side_diff(source: str, dest: str):
    src_lines = source.splitlines()
    dst_lines = dest.splitlines()

    left: list[dict] = []
    right: list[dict] = []

    matcher = difflib.SequenceMatcher(None, src_lines, dst_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for line in src_lines[i1:i2]:
                left.append({"content": line, "type": "equal"})
            for line in dst_lines[j1:j2]:
                right.append({"content": line, "type": "equal"})

        elif tag == "replace":
            src_chunk = src_lines[i1:i2]
            dst_chunk = dst_lines[j1:j2]
            max_len = max(len(src_chunk), len(dst_chunk))
            for k in range(max_len):
                left.append({"content": src_chunk[k] if k < len(src_chunk) else "", "type": "changed" if k < len(src_chunk) else "empty"})
                right.append({"content": dst_chunk[k] if k < len(dst_chunk) else "", "type": "changed" if k < len(dst_chunk) else "empty"})

        elif tag == "delete":
            for line in src_lines[i1:i2]:
                left.append({"content": line, "type": "removed"})
                right.append({"content": "", "type": "empty"})

        elif tag == "insert":
            for line in dst_lines[j1:j2]:
                left.append({"content": "", "type": "empty"})
                right.append({"content": line, "type": "added"})

    return left, right
