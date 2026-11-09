#!/usr/bin/env python3
"""Compare a Lumen-X forecast with the hidden real days ("truth test").

Usage:
  python3 scripts/evaluate_forecast.py FORECAST.json TRUTH.csv [--train TRAIN.csv]

  FORECAST.json  response of GET /products/{id}/forecast
  TRUTH.csv      real days (columns date,quantity) that the system has NOT seen
  --train        the history loaded into the system: used to compare with the seasonal naive

Python standard library only: nothing to install.
"""
import argparse
import csv
import json
import math
import sys
from datetime import date, timedelta


def read_csv(path):
    rows = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows[date.fromisoformat(r["date"][:10])] = float(r["quantity"])
    return rows


def metrics(actual, pred):
    err = [a - p for a, p in zip(actual, pred)]
    n = len(err)
    mae = sum(abs(e) for e in err) / n
    rmse = math.sqrt(sum(e * e for e in err) / n)
    total = sum(actual)
    wape = (sum(abs(e) for e in err) / total * 100) if total > 0 else float("nan")
    return mae, rmse, wape


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("forecast")
    ap.add_argument("truth")
    ap.add_argument("--train")
    args = ap.parse_args()

    with open(args.forecast, encoding="utf-8") as f:
        fc = json.load(f)
    points = {date.fromisoformat(p["date"]): p for p in fc["forecast"]}
    truth = read_csv(args.truth)

    days = sorted(d for d in truth if d in points)
    if not days:
        sys.exit("No dates in common between the forecast and the real days: check that the forecast starts the day after the last loaded day.")
    if len(days) < len(truth):
        print(f"Warning: comparing {len(days)} days out of {len(truth)} (the rest is not in the forecast).")

    actual = [truth[d] for d in days]
    yhat = [points[d]["yhat"] for d in days]
    mae, rmse, wape = metrics(actual, yhat)
    inside = sum(1 for d in days if points[d]["lower"] <= truth[d] <= points[d]["upper"])
    coverage = inside / len(days) * 100
    zeros = sum(1 for a in actual if a == 0)

    print(f"Method chosen by the system: {fc.get('methodUsed')}")
    print(f"Days compared             : {len(days)} ({days[0]} -> {days[-1]}), of which zero: {zeros}")
    print(f"Real sales, total         : {sum(actual):.1f}   forecast: {sum(yhat):.1f}")
    print()
    print(f"{'':16}{'MAE':>10}{'RMSE':>10}{'WAPE %':>10}")
    print(f"{'system':16}{mae:>10.2f}{rmse:>10.2f}{wape:>10.1f}")

    if args.train:
        train = read_csv(args.train)
        last = max(train)
        if days[0] != last + timedelta(days=1):
            print(f"\n(naive not computed: the forecast starts on {days[0]} but the history ends on {last})")
        else:
            week = [train.get(last - timedelta(days=6 - i)) for i in range(7)]
            if any(v is None for v in week):
                print("\n(naive not computed: some days are missing in the last week of the history)")
            else:
                naive = [week[(d - days[0]).days % 7] for d in days]
                n_mae, n_rmse, n_wape = metrics(actual, naive)
                print(f"{'seasonal naive':16}{n_mae:>10.2f}{n_rmse:>10.2f}{n_wape:>10.1f}")
                if n_mae > 0:
                    print(f"\nImprovement over the naive (MAE): {(n_mae - mae) / n_mae * 100:+.1f}%")

    print(f"\n80% interval: {inside} days out of {len(days)} inside the band = {coverage:.0f}% (expected about 80%)")


if __name__ == "__main__":
    main()
