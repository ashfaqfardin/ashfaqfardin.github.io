#!/usr/bin/env python3
"""Turns the PDFs in content/Notes into material for the website.

The start of the file name says what a PDF is:

  AI_Research_YYYY-MM-DD_Some_Title.pdf   slides about a paper
  AI_Tutorial_YYYY-MM-DD_Some_Title.pdf   a lesson, drawn like an app

For each one it renders the slides to assets/notes/<slug>/ and reads their text
(headline, source, tags, a transcript), then writes content/notes.json.
tools/build-seo.mjs builds the pages from that.

A lesson's buttons and quiz answers are only pictures in the PDF, so this also
records where they are drawn. The site lays working controls over those spots.

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

FORMAT = 2  # bump after changing what this script produces, to reprocess every PDF
SLIDE_WIDTH = 1080
THUMB_WIDTH = 480
COVER_SIZE = (1200, 630)  # social share image
LESSON_COVER = (0.92, 0.09)  # a lesson's share image: page width used, and where it starts
FILE_NAME = re.compile(r"(\d{4}-\d{2}-\d{2})[_-](.+)\.pdf$", re.IGNORECASE)
PAGE_NUMBER = re.compile(r"\d+\s*/\s*\d+$")
REFERENCE = re.compile(r"([\w.-]+\.[a-z]{2,}/\S+)(?: · .+)?$")
SIGNATURE = re.compile(r"Mohammad Ashfaq|Follow for daily|ashfaqfardin\.dev$")

# What a lesson draws to look like an app, as opposed to what it teaches.
BUTTONS = {"Start lesson": "next", "Continue": "next", "Check": "check"}
QUIZ_HINT = "Answer on the next slide →"
CHROME = {"×", "→", "✓", QUIZ_HINT, *BUTTONS}
OPTION = re.compile(r"[A-F]")
ANSWER = re.compile(r"Answer:\s*([A-F])\b")
LESSON_SOURCE = re.compile(r"Tutorial\s*·\s*(.+)")
CITED_TITLE = re.compile(r"[\"“]([^\"”]+)[\"”]\s*\(\d{4}\)")
ROW_TOLERANCE = 0.012  # lines this close, as a fraction of the slide height, are one row


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


def parse_kind(path):
    return "tutorial" if path.name.lower().startswith("ai_tutorial") else "research"


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
                        "middle": (line["bbox"][1] + line["bbox"][3]) / 2 / page.rect.height,
                        "rect": pymupdf.Rect(line["bbox"]),
                        "mono": all("Mono" in span["font"] for span in line["spans"]),
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


def find_references(slide):
    """Links listed on a slide, written as bare text like arxiv.org/abs/1706.03762 · a note."""
    texts = [text for item in slide["body"] for text in item.get("text", "").split("\n")]
    matches = [REFERENCE.fullmatch(text) for text in texts]
    return [{"url": f"https://{match.group(1)}", "text": match.group(0)} for match in matches if match]


def read_research(document, title):
    slides = [read_slide(page) for page in document]
    first, last = slides[0], slides[-1]
    all_text = " ".join(line["text"] for page in document for line in read_lines(page))
    arxiv = re.search(r"arXiv[ :](\d{4}\.\d{4,5})", all_text)
    references = find_references(last)
    paper_title, byline = after_label(first, "THE PAPER", 2)
    return {
        "headline": first["headline"] or title,
        "idea": after_label(first, "THE IDEA")[0],
        "takeaway": last["headline"] if len(slides) > 1 else "",
        "tags": [tag.strip() for tag in first["kicker"].split("·") if tag.strip()],
        "paper": {
            "title": paper_title or title,
            "byline": byline,
            "arxiv": arxiv.group(1) if arxiv else "",
            "url": f"https://arxiv.org/abs/{arxiv.group(1)}" if arxiv else (references[0]["url"] if references else ""),
        },
        "references": references,
        "slides": slides,
    }


def percent_box(page, rect):
    """A rectangle as [left, top, width, height] percentages of the slide."""
    size = page.rect
    return [
        round(100 * value, 2)
        for value in (rect.x0 / size.width, rect.y0 / size.height, rect.width / size.width, rect.height / size.height)
    ]


def shape_around(page, rect):
    """The button or card drawn behind some text, with its drop shadow."""
    limit = page.rect.get_area() / 2
    shapes = [drawing["rect"] for drawing in page.get_drawings()]
    shapes = [shape for shape in shapes if shape.contains(rect) and shape.get_area() < limit]
    if not shapes:
        return rect
    smallest = min(shape.get_area() for shape in shapes)
    found = pymupdf.Rect(rect)
    for shape in shapes:
        if shape.get_area() < smallest * 1.1:
            found |= shape
    return found


def read_options(lines):
    """A quiz's answers: a letter in a small box, followed by the answer in bigger text."""
    return [(key, text) for key, text in zip(lines, lines[1:]) if OPTION.fullmatch(key["text"]) and key["size"] < text["size"]]


def read_hotspots(page, lines, options):
    """Where a lesson's drawn controls are, so the site can make them work."""
    spots = []
    for line in lines:
        if line["text"] == "×":
            spots.append({"action": "exit", "label": "Leave this lesson", "box": percent_box(page, shape_around(page, line["rect"]))})
        elif line["text"] in BUTTONS:
            spots.append({"action": BUTTONS[line["text"]], "label": line["text"], "box": percent_box(page, shape_around(page, line["rect"]))})
        elif line["text"] == QUIZ_HINT:
            rect = pymupdf.Rect(line["rect"])
            rect.x1 = shape_around(page, rect).x1 - line["size"]
            spots.append({"action": "note", "box": percent_box(page, rect)})
    for key, text in options:
        box = percent_box(page, shape_around(page, key["rect"] | text["rect"]))
        spots.append({"action": "option", "key": key["text"], "label": f"{key['text']}. {text['text']}", "box": box})
    return spots


def group_rows(lines):
    """Lines that sit side by side, like the cells of a table, in drawing order."""
    rows = []
    for line in lines:
        if rows and abs(line["middle"] - rows[-1][-1]["middle"]) < ROW_TOLERANCE and line["x"] > rows[-1][-1]["x"]:
            rows[-1].append(line)
        else:
            rows.append([line])
    return rows


def write_paragraphs(lines, items):
    """Appends a lesson's running text to items: labels, paragraphs and small chart values."""
    number = ""
    for paragraph in join_wrapped(lines):
        text = paragraph["text"]
        if SIGNATURE.match(text):
            continue
        if len(text) == 1 and text.isdigit():  # the numbered badge on a card
            number = f"{text}. "
        elif paragraph["size"] <= 10 or (text.isupper() and paragraph["size"] <= 11):
            items.append({"kind": "label", "text": text})
        elif number:
            items.append({"kind": "text", "text": number + text})
            number = ""
        elif re.fullmatch(r"[\d.,%]+", text) and items and items[-1]["kind"] == "text" and re.fullmatch(r"[\d.,% ]+", items[-1]["text"]):
            items[-1]["text"] += " " + text
        else:
            items.append({"kind": "text", "text": text})


def read_lesson_body(lines):
    """A lesson slide as tables, code and paragraphs, for the text version of the page."""
    rows = group_rows(lines)
    items = []
    waiting = []
    index = 0
    while index < len(rows):
        row = rows[index]
        table_end = index
        while table_end < len(rows) and len(rows[table_end]) == len(row):
            table_end += 1
        code_end = index
        while (
            code_end < len(rows)
            and len(rows[code_end]) == 1
            and rows[code_end][0]["mono"]
            and abs(rows[code_end][0]["x"] - row[0]["x"]) < 2
        ):
            code_end += 1

        if len(row) >= 3 and table_end - index >= 2:
            write_paragraphs(waiting, items)
            waiting = []
            head, *body = [[line["text"] for line in cells] for cells in rows[index:table_end]]
            items.append({"kind": "table", "head": head, "rows": body})
            index = table_end
        elif code_end - index >= 2:
            write_paragraphs(waiting, items)
            waiting = []
            items.append({"kind": "code", "text": "\n".join(cells[0]["text"] for cells in rows[index:code_end])})
            index = code_end
        else:
            # Wrapped text carries on from a row's last cell, so the row takes that cell's place.
            waiting.append({**row[-1], "text": " ".join(line["text"] for line in row)})
            index += 1
    write_paragraphs(waiting, items)
    return items


def read_lesson_slide(page):
    lines = [line for line in read_lines(page) if line["top"] < 0.91]
    options = read_options(lines) if any(line["text"] == "Check" for line in lines) else []
    hotspots = read_hotspots(page, lines, options)

    in_options = [line for pair in options for line in pair]
    lines = [line for line in lines if not (line["text"] in CHROME or PAGE_NUMBER.fullmatch(line["text"]) or line in in_options)]
    top = [line for line in lines if line["top"] < 0.3]
    biggest = max((line["size"] for line in top), default=0)
    headline = [line for line in top if line["size"] == biggest]
    kicker = [line for line in top if headline and line["y"] < headline[0]["y"]]
    body = read_lesson_body([line for line in lines if line not in headline and line not in kicker])
    body += [{"kind": "text", "text": f"● {key['text']}. {text['text']}"} for key, text in options]

    return {
        "kicker": " ".join(line["text"] for line in kicker),
        "headline": " ".join(line["text"] for line in headline),
        "body": body,
        "hotspots": hotspots,
    }


def read_cover(page, title):
    """A lesson's first slide: artwork, then its chips, title and subtitle, then a row of facts."""
    plain = {"headline": title, "idea": "", "tags": [], "facts": []}
    lines = [line for line in read_lines(page) if line["top"] < 0.91 and line["text"] not in CHROME]
    start = next((index for index, line in enumerate(lines) if line["text"].upper() == "AI TUTORIAL"), None)
    if start is None or start + 1 == len(lines):
        return plain

    details = lines[start + 1 :]
    biggest = max(line["size"] for line in details)
    heading = [line for line in details if line["size"] == biggest]
    chips = details[: details.index(heading[0])]
    return {
        "headline": " ".join(line["text"] for line in heading),
        "idea": " ".join(line["text"] for line in details[details.index(heading[-1]) + 1 :]),
        "tags": [line["text"].title() if line["text"].isupper() else line["text"] for line in chips],
        "facts": [line["text"] for line in lines[:start] if line["top"] > heading[-1]["top"]],
    }


def link_quizzes(slides):
    """A lesson reveals a quiz's answer in the headline of the slide after it."""
    for slide, following in zip(slides, slides[1:]):
        answer = ANSWER.match(following["headline"])
        keys = [spot["key"] for spot in slide["hotspots"] if spot["action"] == "option"]
        if answer and answer.group(1) in keys:
            for spot in slide["hotspots"]:
                if spot["action"] == "check":
                    spot["answer"] = answer.group(1)


def read_code(slides):
    """The snippet a lesson gives readers to try, which is only useful as real text."""
    for slide in slides:
        for item, following in zip(slide["body"], slide["body"][1:]):
            if item["kind"] == "label" and "CODE" in item["text"] and following["kind"] == "code":
                return following["text"]
    return ""


def read_tutorial(document, title):
    cover = read_cover(document[0], title)
    slides = [read_lesson_slide(page) for page in document]
    intro = [{"kind": "text", "text": text} for text in [cover["idea"], *cover["facts"]] if text]
    slides[0].update(kicker="", headline=cover["headline"], body=intro)
    link_quizzes(slides)

    texts = [line["text"] for page in document for line in read_lines(page)]
    source = next((match.group(1) for match in map(LESSON_SOURCE.fullmatch, texts) if match), "")
    cited = CITED_TITLE.search(" ".join(texts))
    references = find_references(slides[-1])
    return {
        **cover,
        "takeaway": after_label(slides[-1], "TAKEAWAY")[0],
        "code": read_code(slides),
        "paper": {
            "title": cited.group(1) if cited else source or title,
            "byline": source if cited else "",
            "arxiv": "",
            "url": references[0]["url"] if references else "",
        },
        "references": references,
        "slides": slides,
    }


def render(page, width):
    zoom = width / page.rect.width
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def share_image(document, kind):
    width, height = COVER_SIZE
    if kind != "tutorial":
        return render(document[0], width).crop((0, 0, width, height))
    # Skip the lesson's progress bar and stop just above its title.
    used, start = LESSON_COVER
    full = round(width / used)
    left, top = (full - width) // 2, round(full * start)
    return render(document[0], full).crop((left, top, left + width, top + height))


def process(pdf, digest, kind, day, title, slug):
    target = OUTPUT / slug
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)

    document = pymupdf.open(pdf)
    if not len(document):
        sys.exit(f"{pdf.name} has no pages")
    for number, page in enumerate(document, start=1):
        render(page, SLIDE_WIDTH).save(target / f"slide-{number}.webp", "WEBP", quality=80, method=6)
    render(document[0], THUMB_WIDTH).save(target / "thumb.webp", "WEBP", quality=72, method=6)
    share_image(document, kind).save(target / "cover.jpg", "JPEG", quality=84, optimize=True, progressive=True)

    note = {
        "format": FORMAT,
        "hash": digest,
        "slug": slug,
        "date": day,
        "file": pdf.name,
        "title": title,
        "kind": kind,
        **(read_tutorial if kind == "tutorial" else read_research)(document, title),
    }
    (target / "meta.json").write_text(json.dumps(note, ensure_ascii=False), encoding="utf-8")
    print(f"  {slug} ({kind}, {len(note['slides'])} slides)")
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
        notes.append(load_cached(slug, digest) or process(pdf, digest, parse_kind(pdf), day, title, slug))

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
