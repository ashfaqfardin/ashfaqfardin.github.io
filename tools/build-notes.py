#!/usr/bin/env python3
"""Turns the PDFs in content/Notes into material for the website.

For each AI_Research_YYYY-MM-DD_Some_Title.pdf it renders the slides to
assets/notes/<slug>/ and reads their text (headline, paper, tags, a transcript),
then writes content/notes.json. tools/build-seo.mjs builds the pages from that.

PDFs that haven't changed are skipped, and a note whose PDF was deleted is removed.

Needs:  pip install pymupdf pillow
Run:    python tools/build-notes.py
"""
import hashlib
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "content" / "Notes"
OUTPUT = ROOT / "assets" / "notes"
INDEX = ROOT / "content" / "notes.json"

FORMAT = 1  # bump after changing what this script produces, to reprocess every PDF
SLIDE_WIDTH = 1080
THUMB_WIDTH = 480
COVER_SIZE = (1200, 630)  # social share image
FILE_NAME = re.compile(r"(\d{4}-\d{2}-\d{2})[_-](.+)\.pdf$", re.IGNORECASE)
PAGE_NUMBER = re.compile(r"\d+\s*/\s*\d+$")
BARE_URL = re.compile(r"[\w.-]+\.[a-z]{2,}/\S+$")
SIGNATURE = re.compile(r"Mohammad Ashfaq|Follow for daily|ashfaqfardin\.dev$")


def parse_name(path):
    """('2026-11-03', 'Gradient Safety Data Filtering') or None if the name has no valid date."""
    match = FILE_NAME.search(path.name)
    if not match:
        return None
    try:
        date.fromisoformat(match.group(1))
    except ValueError:
        return None
    return match.group(1), re.sub(r"[_-]+", " ", match.group(2)).strip()


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def read_lines(page):
    """Text lines in document order, as fractions of the slide height for y."""
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                lines.append(
                    {
                        "text": text,
                        "size": max(span["size"] for span in line["spans"]),
                        "x": line["bbox"][0],
                        "y": line["bbox"][1],
                        "top": line["bbox"][1] / page.rect.height,
                    }
                )
    return lines


def join_wrapped(lines):
    """Rebuilds paragraphs: lines of one size that follow each other closely in a column."""
    paragraphs = []
    for line in lines:
        last = paragraphs[-1] if paragraphs else None
        follows = (
            last
            and abs(line["size"] - last["size"]) < 0.6
            and 0 < line["y"] - last["y"] < line["size"] * 1.65
            and (abs(line["x"] - last["x"]) < 2 or last["text"].startswith("●"))
            and not line["text"].startswith("●")
        )
        if follows:
            last["text"] += " " + line["text"]
            last["x"], last["y"] = line["x"], line["y"]
        else:
            paragraphs.append(dict(line))
    return paragraphs


def read_slide(page):
    """Splits a slide into kicker, headline and body, dropping the repeating footer."""
    lines = [line for line in read_lines(page) if line["top"] < 0.91]
    top = [line for line in lines if line["top"] < 0.3]
    biggest = max((line["size"] for line in top), default=0)
    headline = [line for line in top if line["size"] == biggest]
    kicker = [line for line in lines if line["top"] < 0.08 and line not in headline and not PAGE_NUMBER.fullmatch(line["text"])]
    body = [line for line in lines if line["top"] >= 0.08 and line not in headline]

    items = []
    for paragraph in join_wrapped(body):
        text = paragraph["text"]
        if SIGNATURE.match(text):
            continue
        kind = "label" if text.isupper() and paragraph["size"] <= 11 else "text"
        # Chart values and token rows come out as tiny fragments; keep them on one line.
        if kind == "text" and len(text) <= 14 and items and items[-1]["kind"] == "text" and items[-1].get("short"):
            items[-1]["text"] += " " + text
            continue
        items.append({"kind": kind, "text": text, **({"short": True} if len(text) <= 14 else {})})
    for item in items:
        item.pop("short", None)

    return {
        "kicker": " ".join(line["text"] for line in kicker),
        "headline": " ".join(line["text"] for line in headline),
        "body": items,
    }


def after_label(slide, label, count=1):
    """The text items that follow a label such as THE PAPER on a slide."""
    for index, item in enumerate(slide["body"]):
        if item["kind"] == "label" and item["text"] == label:
            found = [other["text"] for other in slide["body"][index + 1 : index + 1 + count] if other["kind"] == "text"]
            return found + [""] * (count - len(found))
    return [""] * count


def render(page, width):
    zoom = width / page.rect.width
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def process(pdf, digest, day, title, slug):
    target = OUTPUT / slug
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)

    document = pymupdf.open(pdf)
    if not len(document):
        sys.exit(f"{pdf.name} has no pages")
    for number, page in enumerate(document, start=1):
        render(page, SLIDE_WIDTH).save(target / f"slide-{number}.webp", "WEBP", quality=80, method=6)
    render(document[0], THUMB_WIDTH).save(target / "thumb.webp", "WEBP", quality=72, method=6)
    width, height = COVER_SIZE
    cover = render(document[0], width).crop((0, 0, width, height))
    cover.save(target / "cover.jpg", "JPEG", quality=84, optimize=True, progressive=True)

    slides = [read_slide(page) for page in document]
    first, last = slides[0], slides[-1]
    all_text = " ".join(line["text"] for page in document for line in read_lines(page))
    arxiv = re.search(r"arXiv[ :](\d{4}\.\d{4,5})", all_text)
    references = [f"https://{item['text']}" for item in last["body"] if item["kind"] == "text" and BARE_URL.fullmatch(item["text"])]
    paper_title, byline = after_label(first, "THE PAPER", 2)

    note = {
        "format": FORMAT,
        "hash": digest,
        "slug": slug,
        "date": day,
        "file": pdf.name,
        "title": title,
        "headline": first["headline"] or title,
        "idea": after_label(first, "THE IDEA")[0],
        "takeaway": last["headline"] if len(slides) > 1 else "",
        "tags": [tag.strip() for tag in first["kicker"].split("·") if tag.strip()],
        "paper": {
            "title": paper_title or title,
            "byline": byline,
            "arxiv": arxiv.group(1) if arxiv else "",
            "url": f"https://arxiv.org/abs/{arxiv.group(1)}" if arxiv else (references[0] if references else ""),
        },
        "references": references,
        "slides": slides,
    }
    (target / "meta.json").write_text(json.dumps(note, ensure_ascii=False), encoding="utf-8")
    print(f"  {slug} ({len(slides)} slides)")
    return note


def load_cached(slug, digest):
    try:
        note = json.loads((OUTPUT / slug / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return note if note.get("hash") == digest and note.get("format") == FORMAT else None


def main():
    pdfs = sorted(p for p in SOURCE.iterdir() if p.suffix.lower() == ".pdf") if SOURCE.is_dir() else []
    misnamed = [pdf.name for pdf in pdfs if not parse_name(pdf)]
    if misnamed:
        sys.exit("These PDFs need a date in their name, like AI_Research_2026-11-04_Some_Title.pdf:\n  " + "\n  ".join(misnamed))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    notes = []
    for pdf in pdfs:
        day, title = parse_name(pdf)
        slug = f"{day}-{slugify(title)}"
        digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
        notes.append(load_cached(slug, digest) or process(pdf, digest, day, title, slug))

    keep = {note["slug"] for note in notes}
    for folder in OUTPUT.iterdir():
        if folder.is_dir() and folder.name not in keep:
            shutil.rmtree(folder)
            print(f"  removed {folder.name}")

    notes.sort(key=lambda note: note["date"], reverse=True)
    INDEX.write_text(json.dumps(notes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  content/notes.json ({len(notes)} notes)")


if __name__ == "__main__":
    main()
