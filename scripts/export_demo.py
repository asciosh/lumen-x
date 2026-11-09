#!/usr/bin/env python3
"""Export the data shown by the static demo (docs/index.html) from a RUNNING Lumen-X backend.

The demo is a static page, so it cannot compute anything: every number and answer it shows is a real response
of the app, saved to JSON by this script. Run it again whenever you want the demo to show the latest behaviour.

Usage (backend running, with a product that already has sales and a forecast):
  python3 scripts/export_demo.py --product 5
  python3 scripts/export_demo.py --product 5 --base http://localhost:8080 --out docs/data --no-ai

Writes into docs/data: sales.json, forecast.json, explanation-it.json, explanation-en.json, ask.json, reorder.json.
Python standard library only: nothing to install. No keys are read or written.
"""
import argparse
import datetime
import json
import pathlib
import sys
import urllib.error
import urllib.request


def call(base, path, body=None):
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(base.rstrip("/") + path, data=data, headers=headers,
                                     method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        sys.exit(f"HTTP {error.code} on {path}: {error.read().decode('utf-8', 'replace')[:300]}")
    except urllib.error.URLError as error:
        sys.exit(f"Cannot reach the backend at {base}: {error.reason}. Is it running?")


def save(folder, name, payload):
    (folder / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  wrote {folder / name}")


def main():
    parser = argparse.ArgumentParser(description="Export the demo data from a running Lumen-X backend.")
    parser.add_argument("--product", type=int, required=True, help="id of the product to show")
    parser.add_argument("--base", default="http://localhost:8080", help="backend address (default http://localhost:8080)")
    parser.add_argument("--out", default="docs/data", help="output folder (default docs/data)")
    parser.add_argument("--no-ai", action="store_true", help="explanations from the template only (no Gemini)")
    args = parser.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pid = args.product

    product = call(args.base, f"/products/{pid}")
    print(f"Product {pid}: {product['name']}")

    save(out, "sales.json", call(args.base, f"/products/{pid}/sales"))
    save(out, "forecast.json", call(args.base, f"/products/{pid}/forecast"))

    use_ai = "false" if args.no_ai else "true"
    for lang in ("it", "en"):
        save(out, f"explanation-{lang}.json",
             call(args.base, f"/products/{pid}/forecast/explanation?lang={lang}&useAi={use_ai}"))

    # Questions: a question that is not understood returns the list of example questions that are sure to work.
    questions = {}
    for lang in ("it", "en"):
        examples = call(args.base, f"/products/{pid}/ask", {"question": "zzz", "language": lang}).get("suggestions", [])
        if not examples:
            sys.exit("The backend returned no example questions: is it the latest version?")
        answers = []
        for question in examples:
            reply = call(args.base, f"/products/{pid}/ask", {"question": question, "language": lang})
            answers.append({"question": question, "intent": reply["intent"],
                            "understood": reply["understood"], "answer": reply["answer"]})
            print(f"  [{lang}] {reply['intent']:<16} {question}")
        questions[lang] = answers
    save(out, "ask.json", {
        "exportedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "productName": product["name"],
        "questions": questions,
    })

    variants = [call(args.base, f"/products/{pid}/reorder?leadTimeDays=7&reviewDays=7&serviceLevel={level}")
                for level in (90, 95, 98, 99)]
    save(out, "reorder.json", {"variants": variants})

    print("Done. Check docs/data, then commit and push: GitHub Pages publishes the demo by itself.")


if __name__ == "__main__":
    main()
