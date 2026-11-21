# Analytics deliverables

| Folder | Contents |
|---|---|
| `powerbi/` | Model and report guide (`README.md`), DAX measure library (`measures.dax`), Power Query scripts for all 12 reporting tables (`power_query/`), report theme (`theme.json`) |
| `sql/` | Analytical queries over the `reporting` schema: leakage trend, leakage Pareto, receivables ageing, profitability by segment, exception resolution |
| `notebooks/` | Executed Jupyter notebooks: revenue leakage analysis and unit economics. Each starts with assertions that reconcile the reporting layer to the stored audits and engine output |
| `reports/` | Written findings from the notebooks |

The reporting layer itself (schema `reporting`, views, snapshot tables and the read-only `powerbi_reader` role) is created by migration `0005`, from `backend/app/reporting/views.sql`.

To re-run the notebooks against your own database, preferably using the read-only role:

```bash
export DATABASE_URL=postgresql+psycopg://powerbi_reader:<password>@localhost:5432/sra
jupyter nbconvert --to notebook --execute --inplace analytics/notebooks/*.ipynb
```

**No `.pbix` file is included.** Power BI Desktop was not available in the build environment, so a report file could not be produced or tested there. `powerbi/README.md` describes how to assemble the report from these files.
