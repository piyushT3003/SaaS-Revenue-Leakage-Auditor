# Analytics findings (demo dataset)

> **Synthetic data.** These figures come from the seeded demonstration dataset (200 customers, May–Oct 2026), which contains deliberately planted anomalies. They are **not** real revenue, recoveries or savings.

Source: `analytics/notebooks/01_revenue_leakage_analysis.ipynb` and `02_unit_economics_analysis.ipynb`, executed against the demo database on 16 Nov 2026.

## Data integrity checks (all passed)

- **Audit reconciliation:** for every audited month, Σ `fact_reconciliation.underbilled_amount` = `audit_runs.underbilled_total`, and the same holds for overbilling (6 of 6 months).
- **Arithmetic and segment rules:** 1,064 customer-months satisfy `net_revenue − direct_cost = contribution`, and each one's profitability segment matches the documented thresholds (≥15% / 0–15% / <0%).

## Revenue leakage

| Month | Leakage | Reconciliation rate |
|---|---|---|
| May 2026 | ₹14,925 | 99.60% |
| Jun 2026 | ₹29,745 | 99.42% |
| Jul 2026 | ₹25,500 | 99.44% |
| Aug 2026 | ₹38,481 | 99.25% |
| Sep 2026 | ₹33,367 | 99.26% |
| **Oct 2026** | **₹1,55,300** | **97.27%** |

- **October spike:** leakage is 5.5× the prior-month average (+365% month on month). October is also the only month with overbilling (₹2,76,027.50).
- **Concentration:** 4 of the 8 underbilled customers make up at least 80% of October leakage. TechNova Pvt. Ltd. alone accounts for 38.6% (₹60,000).

## Unit economics

- **Portfolio margin:** contribution margin ranges from 31.6% (May) to 39.7% (Oct).
- **SMB margin:** the SMB segment has negative contribution margin in every month, between −13.2% (May, the lowest) and −6.8% (Oct).
- **Where unprofitable customers sit:** SMB is the largest group of unprofitable customers (11 of 26 in October), but not a majority; Mid-Market has 9 and Enterprise 6.
- **Enterprise margin:** Enterprise margin improved from 37.1% to 45.6% over the period.

## Suggested next analyses (once real data is connected)

- **Leakage drivers:** run a key-influencers analysis on `underbilled_amount > 0` against product, contract features and region.
- **Cost allocation:** test how sensitive SMB profitability is to the cost-allocation method, using the What-If Simulator in the app.
