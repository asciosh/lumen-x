#!/usr/bin/env python3
"""Valutazione su piu' finestre ("rolling origin") del servizio di forecasting di Lumen-X.

Per ogni finestra: usa lo storico fino a una data di taglio, prevede i `h` giorni
successivi con il codice VERO del servizio (metodi auto, naive, ets, lightgbm) e confronta
con i giorni reali. Serve a capire se la scelta di `auto` regge su piu' periodi, non su uno solo.

Uso, dentro il container del servizio:
  python /tmp/rolling_eval.py /tmp/pane.csv --folds 8 --h 28
Il CSV deve avere le colonne date,quantity (lo storico COMPLETO, comprese le ultime settimane).
"""
import argparse
import csv
import os
import sys
import time
from datetime import date, timedelta

here = os.path.dirname(os.path.abspath(__file__))
for base in ("/srv", os.path.join(here, "..", "services", "forecasting")):
    if os.path.isdir(os.path.join(base, "app")):
        sys.path.insert(0, base)
        break

import pandas as pd  # noqa: E402
from app.models import METHODS, lightgbm_ok  # noqa: E402
from app.service import SeriesError, prepare_series, run_forecast  # noqa: E402

RUN = ["auto", "naive", "ets", "lightgbm"]       # metodi del servizio
COLS = RUN + ["blend"]                            # blend = media di ets e lightgbm (solo in questo test)


def wape_bias(actual, pred):
    total = sum(actual)
    if total <= 0:
        return None, None
    return (sum(abs(a - p) for a, p in zip(actual, pred)) / total * 100,
            (sum(pred) / total - 1) * 100)


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def fmt(x, w=8, d=1):
    return f"{'-':>{w}}" if x is None else f"{x:>{w}.{d}f}"


def blend_score(dates, values, h, truth):
    """Errore della media semplice tra ETS e LightGBM, sugli stessi giorni reali."""
    try:
        y, _ = prepare_series(dates, values)
        if not lightgbm_ok(len(y), h):
            return (None, None)
        pred = (METHODS["ets"](y, h) + METHODS["lightgbm"](y, h)) / 2
        days = pd.date_range(y.index[-1] + pd.Timedelta(days=1), periods=h, freq="D")
        pts = [(truth[d.date()], float(p)) for d, p in zip(days, pred) if d.date() in truth]
        return wape_bias([a for a, _ in pts], [p for _, p in pts])
    except Exception:
        return (None, None)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--folds", type=int, default=8)
    ap.add_argument("--h", type=int, default=28)
    args = ap.parse_args()

    with open(args.csv, newline="", encoding="utf-8") as f:
        rows = sorted((date.fromisoformat(r["date"][:10]), float(r["quantity"])) for r in csv.DictReader(f))
    last = rows[-1][0]
    print(f"Storico: {len(rows)} righe, {rows[0][0]} -> {last}. Finestre da {args.h} giorni, {args.folds} in totale.\n")

    results = []   # per fold: {metodo: (wape, bias)}, chosen
    for i in range(args.folds - 1, -1, -1):
        cutoff = last - timedelta(days=args.h * (i + 1))
        train = [(d, v) for d, v in rows if d <= cutoff]
        truth = {d: v for d, v in rows if cutoff < d <= cutoff + timedelta(days=args.h)}
        if len(train) < 60 or len(truth) < args.h // 2:
            print(f"finestra con taglio {cutoff}: saltata (dati insufficienti)")
            continue
        t0 = time.time()
        dates, values = [d for d, _ in train], [v for _, v in train]
        per, chosen, cov = {}, None, None
        for m in RUN:
            try:
                res = run_forecast(dates, values, args.h, m)
            except SeriesError:
                per[m] = (None, None)
                continue
            if m == "auto":
                chosen = res["method_used"]
                hits = [p["lower"] <= truth[p["date"]] <= p["upper"] for p in res["forecast"] if p["date"] in truth]
                cov = sum(hits) / len(hits) * 100 if hits else None
            pts = [(truth[p["date"]], p["yhat"]) for p in res["forecast"] if p["date"] in truth]
            per[m] = wape_bias([a for a, _ in pts], [p for _, p in pts])
        per["blend"] = blend_score(dates, values, args.h, truth)
        results.append((cutoff, chosen, per, cov))
        print(f"  taglio {cutoff} fatto in {time.time() - t0:.0f}s", file=sys.stderr, flush=True)

    print("\nWAPE % per finestra (piu' basso = meglio)")
    print(f"{'taglio':<12}{'auto sceglie':<14}" + "".join(f"{m:>10}" for m in COLS) + f"{'in fascia %':>13}")
    for cutoff, chosen, per, cov in results:
        print(f"{str(cutoff):<12}{str(chosen):<14}" + "".join(fmt(per[m][0], 10) for m in COLS) + fmt(cov, 13, 0))

    print(f"\n{'':<26}" + "".join(f"{m:>10}" for m in COLS))
    print(f"{'MEDIA WAPE %':<26}" + "".join(fmt(mean([r[2][m][0] for r in results]), 10) for m in COLS))
    print(f"{'MEDIA scostamento % *':<26}" + "".join(fmt(mean([r[2][m][1] for r in results]), 10) for m in COLS))
    print(f"{'MEDIA giorni in fascia %':<26}{fmt(mean([r[3] for r in results]), 10, 0)}  (intervallo di auto; atteso circa 80)")
    print("* positivo = prevede troppo, negativo = prevede troppo poco, sul totale dei giorni\n")

    both = [r for r in results if r[2]["auto"][0] is not None and r[2]["naive"][0] is not None]
    wins = sum(1 for r in both if r[2]["auto"][0] < r[2]["naive"][0])
    print(f"auto batte il naive in {wins} finestre su {len(both)}")
    fixed = ["naive", "ets", "lightgbm"]
    best = sum(1 for r in results if r[2]["auto"][0] is not None and
               r[2]["auto"][0] <= min(x for x in (r[2][m][0] for m in fixed) if x is not None) + 1e-9)
    print(f"auto coincide con il metodo migliore in {best} finestre su {len(results)}")

    bw = [r for r in results if r[2]["blend"][0] is not None and r[2]["naive"][0] is not None]
    print(f"blend batte il naive in {sum(1 for r in bw if r[2]['blend'][0] < r[2]['naive'][0])} finestre su {len(bw)}")
    ba = [r for r in results if r[2]["blend"][0] is not None and r[2]["auto"][0] is not None]
    print(f"blend batte auto in {sum(1 for r in ba if r[2]['blend'][0] < r[2]['auto'][0])} finestre su {len(ba)}")

if __name__ == "__main__":
    main()
