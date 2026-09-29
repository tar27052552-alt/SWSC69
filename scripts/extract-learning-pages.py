"""Prepare local review copies and page images for the nine lesson PDFs.

Run after scripts/prepare-learning-v2.mjs downloads the source PDFs.
The .learning-source directory is intentionally ignored by Git.
"""

import json
import shutil
import subprocess
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".learning-source"
PRIMARY = {
    "1GhWC6I26E7XhSWS9fFidHVfRKkPBfM1N",
    "1vgtKQAy5VT-Sl956Ii5CbBBC05Q25Q7N",
    "1n_h5SAS1ueHdYaChTuFt-EG3SzZVv_8F",
    "1IMcXX--UmBr4f6mBJJXkpTalB5egHrrQ",
    "1GyvxOaUIOy1muPpMYBmpxksoFThDyQgP",
    "1VEij2mFi7lNHTpBhY5lh5X8NwMjJiHt8",
    "1FKvSEfTW6BFg3x7mbtoI7imiq8--Ajrj",
    "1_1qPmI7L9JAkLbdnv8XGqFSZlAhkfNje",
    "1U8Xp5sH7AVvSyES1RyJso9ZQEBdeoXoC",
}


def main():
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise SystemExit("pdftoppm (Poppler) is required")
    output = {}
    for pdf in sorted(SOURCE.glob("*.pdf")):
        file_id = pdf.stem
        reader = PdfReader(pdf)
        pages = []
        folder = SOURCE / "pages" / file_id
        if file_id in PRIMARY:
            folder.mkdir(parents=True, exist_ok=True)
            first = next(folder.glob("page-*.jpg"), None)
            if first is None:
                subprocess.run(
                    [renderer, "-scale-to", "1200", "-jpeg", "-jpegopt",
                     "quality=72", str(pdf), str(folder / "page")],
                    check=True,
                )
            for image in folder.glob("page-*.jpg"):
                number = int(image.stem.split("-")[-1])
                destination = folder / f"page-{number:03}.jpg"
                if image != destination:
                    image.rename(destination)
        for index, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            image = folder / f"page-{index:03}.jpg"
            if file_id in PRIMARY and not image.exists():
                raise RuntimeError(f"Missing page image: {image}")
            pages.append({"number": index, "text": text,
                          "imageFile": str(image.relative_to(SOURCE)) if file_id in PRIMARY else None})
        output[file_id] = {"pageCount": len(pages), "pages": pages}
        print(f"{file_id}: {len(pages)} pages, {sum(bool(p['text']) for p in pages)} text pages")
    (SOURCE / "pages.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
