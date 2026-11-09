#!/usr/bin/env python3
"""Generate a sample daily sales CSV for Lumen-X (standard library only).

Examples:
  python3 backend/scripts/generate_sample_csv.py                       # ISO: comma, yyyy-MM-dd, decimals with a dot
  python3 backend/scripts/generate_sample_csv.py --style italian       # ';' , dd/MM/yyyy, decimals with a comma
  python3 backend/scripts/generate_sample_csv.py --days 90 --with-errors --out sample.csv
"""
import argparse
import csv
import random
from datetime import date, timedelta

WEEKLY_PATTERN = [0.90, 0.85, 0.90, 1.00, 1.20, 1.50, 1.30]  # Monday ... Sunday


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a sample sales CSV.")
    parser.add_argument("--days", type=int, default=120, help="number of days (default 120, useful minimum 42)")
    parser.add_argument("--start", default="2025-01-01", help="start date yyyy-mm-dd")
    parser.add_argument("--style", choices=["iso", "italian"], default="iso")
    parser.add_argument("--out", default="sample_sales.csv")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--with-errors", action="store_true", help="adds 2 deliberately wrong rows")
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
        base = 100 + 0.2 * i  # slight trend
        qty = base * WEEKLY_PATTERN[d.weekday()] * (1 + rng.gauss(0, 0.05))
        rows.append([fmt_date(d), fmt_qty(max(qty, 0.0))])

    if args.with_errors and rows:
        middle = len(rows) // 2
        rows.insert(middle, ["not-a-date", "10"])
        rows.insert(middle + 5, [fmt_date(start), "abc"])

    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, delimiter=delimiter)
        writer.writerow(["date", "quantity"])
        writer.writerows(rows)

    print(f"Wrote {args.out}: {args.days} days, {args.style} style"
          f"{', with 2 wrong rows' if args.with_errors else ''}.")


if __name__ == "__main__":
    main()
