#!/usr/bin/env python3
"""Confronta un forecast di Lumen-X con i giorni reali nascosti ("prova di verita'").

Uso:
  python3 scripts/evaluate_forecast.py FORECAST.json TRUTH.csv [--train TRAIN.csv]

  FORECAST.json  risposta di GET /products/{id}/forecast
  TRUTH.csv      giorni reali (colonne date,quantity) che il sistema NON ha visto
  --train        lo storico caricato nel sistema: serve per confrontare col naive stagionale

Solo libreria standard di Python: nessuna installazione.
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
        sys.exit("Nessuna data in comune tra forecast e giorni reali: controlla che il forecast parta il giorno dopo l'ultimo giorno caricato.")
    if len(days) < len(truth):
        print(f"Attenzione: confronto {len(days)} giorni su {len(truth)} (il resto non e' nel forecast).")

    actual = [truth[d] for d in days]
    yhat = [points[d]["yhat"] for d in days]
    mae, rmse, wape = metrics(actual, yhat)
    inside = sum(1 for d in days if points[d]["lower"] <= truth[d] <= points[d]["upper"])
    coverage = inside / len(days) * 100
    zeros = sum(1 for a in actual if a == 0)

    print(f"Metodo scelto dal sistema : {fc.get('methodUsed')}")
    print(f"Giorni confrontati        : {len(days)} ({days[0]} -> {days[-1]}), di cui a zero: {zeros}")
    print(f"Vendite reali, totale     : {sum(actual):.1f}   previste: {sum(yhat):.1f}")
    print()
    print(f"{'':16}{'MAE':>10}{'RMSE':>10}{'WAPE %':>10}")
    print(f"{'sistema':16}{mae:>10.2f}{rmse:>10.2f}{wape:>10.1f}")

    if args.train:
        train = read_csv(args.train)
        last = max(train)
        if days[0] != last + timedelta(days=1):
            print(f"\n(naive non calcolato: il forecast parte il {days[0]} ma lo storico finisce il {last})")
        else:
            week = [train.get(last - timedelta(days=6 - i)) for i in range(7)]
            if any(v is None for v in week):
                print("\n(naive non calcolato: manca qualche giorno nell'ultima settimana dello storico)")
            else:
                naive = [week[(d - days[0]).days % 7] for d in days]
                n_mae, n_rmse, n_wape = metrics(actual, naive)
                print(f"{'naive stagionale':16}{n_mae:>10.2f}{n_rmse:>10.2f}{n_wape:>10.1f}")
                if n_mae > 0:
                    print(f"\nMiglioramento sul naive (MAE): {(n_mae - mae) / n_mae * 100:+.1f}%")

    print(f"\nIntervallo 80%: {inside} giorni su {len(days)} dentro la fascia = {coverage:.0f}% (atteso circa 80%)")


if __name__ == "__main__":
    main()
