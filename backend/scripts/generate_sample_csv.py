#!/usr/bin/env python3
"""Genera un CSV di vendite giornaliere di prova per Lumen-X (solo libreria standard).

Esempi:
  python3 backend/scripts/generate_sample_csv.py                       # ISO: virgola, yyyy-MM-dd, decimali con punto
  python3 backend/scripts/generate_sample_csv.py --style italian       # ';' , dd/MM/yyyy, decimali con virgola
  python3 backend/scripts/generate_sample_csv.py --days 90 --with-errors --out prova.csv
"""
import argparse
import csv
import random
from datetime import date, timedelta

WEEKLY_PATTERN = [0.90, 0.85, 0.90, 1.00, 1.20, 1.50, 1.30]  # lunedì ... domenica


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera un CSV di vendite di prova.")
    parser.add_argument("--days", type=int, default=120, help="numero di giorni (default 120, minimo utile 42)")
    parser.add_argument("--start", default="2025-01-01", help="data di inizio yyyy-mm-dd")
    parser.add_argument("--style", choices=["iso", "italian"], default="iso")
    parser.add_argument("--out", default="sample_sales.csv")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--with-errors", action="store_true", help="aggiunge 2 righe errate di proposito")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    start = date.fromisoformat(args.start)

    if args.style == "italian":
        delimiter = ";"
        fmt_date = lambda d: d.strftime("%d/%m/%Y")
        fmt_qty = lambda q: f"{q:.1f}".replace(".", ",")
    else:
        delimiter = ","
        fmt_date = lambda d: d.strftime("%Y-%m-%d")
        fmt_qty = lambda q: f"{q:.1f}"

    rows = []
    for i in range(args.days):
        d = start + timedelta(days=i)
        base = 100 + 0.2 * i  # leggero trend
        qty = base * WEEKLY_PATTERN[d.weekday()] * (1 + rng.gauss(0, 0.05))
        rows.append([fmt_date(d), fmt_qty(max(qty, 0.0))])

    if args.with_errors and rows:
        middle = len(rows) // 2
        rows.insert(middle, ["non-una-data", "10"])
        rows.insert(middle + 5, [fmt_date(start), "abc"])

    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, delimiter=delimiter)
        writer.writerow(["date", "quantity"])
        writer.writerows(rows)

    print(f"Scritto {args.out}: {args.days} giorni, stile {args.style}"
          f"{', con 2 righe errate' if args.with_errors else ''}.")


if __name__ == "__main__":
    main()
