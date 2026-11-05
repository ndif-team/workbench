#!/usr/bin/env python3
"""Inline assets/ into dist/algorithm-hypothesis.html, a single file to publish.

Edit design-doc.html and assets/*, then run: python3 build.py
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent
html = (root / "design-doc.html").read_text()
html = re.sub(
    r'<link rel="stylesheet" href="(assets/[^"]+)" />',
    lambda m: "<style>\n" + (root / m.group(1)).read_text() + "\n</style>",
    html,
)
html = re.sub(
    r'<script src="(assets/[^"]+)"></script>',
    lambda m: "<script>\n" + (root / m.group(1)).read_text() + "\n</script>",
    html,
)
out = root / "dist" / "algorithm-hypothesis.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(f"wrote {out} ({len(html) // 1024} KB)")
