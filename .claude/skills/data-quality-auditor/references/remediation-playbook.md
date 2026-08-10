# Remediation Playbook and Skill Map

Detailed remediation actions per issue type, deliverable mapping per request type, and related-skill routing.

## Output Artifacts

| Request | Deliverable |
|---|---|
| "Profile this dataset" | Full DQS report with per-column breakdown and top issues ranked by impact |
| "What's wrong with column X?" | Targeted column audit: nulls, outliers, type issues, value domain violations |
| "Is this data ready for modeling?" | Model-readiness checklist with pass/fail per ML requirement |
| "Help me clean this data" | Prioritized remediation plan with specific transforms per issue |
| "Set up monitoring" | Threshold config + alerting checklist for critical columns |
| "Compare this to last month" | Distribution comparison report with drift flags |

---

## Remediation Playbook

### Missing Values
| Null % | Recommended Action |
|---|---|
| < 1% | Drop rows (if dataset is large) or impute with median/mode |
| 1–10% | Impute; add a binary indicator column `col_was_null` |
| 10–30% | Impute cautiously; investigate root cause; document assumption |
| > 30% | Flag for domain review; do not impute blindly; consider dropping column |

### Outliers
- **Likely data error** (value physically impossible): cap, correct, or drop
- **Legitimate extreme** (valid but rare): keep, document, consider log transform for modeling
- **Unknown** (can't determine without domain input): flag, do not silently remove

### Duplicates
1. Confirm uniqueness key with data owner before deduplication
2. Prefer `keep='last'` for event data (most recent state wins)
3. Prefer `keep='first'` for slowly-changing-dimension tables

---

## Related Skills

| Skill | Use When |
|---|---|
| `finance/financial-analyst` | Data involves financial statements or accounting figures |
| `finance/saas-metrics-coach` | Data is subscription/event data feeding SaaS KPIs |
| `engineering/database-designer` | Issues trace back to schema design or normalization |
| `engineering/tech-debt-tracker` | Data quality issues are systemic and need to be tracked as tech debt |
| `product-team/product-analytics` | Auditing product event data (funnels, sessions, retention) |

**When NOT to use this skill:**
- You need to design or optimize the database schema — use `engineering/database-designer`
- You need to build the ETL pipeline itself — use an engineering skill
- The dataset is a financial model output — use `finance/financial-analyst` for model validation

---

