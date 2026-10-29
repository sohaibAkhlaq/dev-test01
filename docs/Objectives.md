# Objectives and Performance Measurement Report

**Candidate Branch:** `dev-test01`  
**Assessment:** xis.ai Full Stack Technical Assessment — Annotation Analytics (CVAT)  
**Evaluator Reference:** Section 6 (Objectives)

---

## 1. System Environment & Baseline Metadata

As required by Section 6, all benchmark metrics were measured directly on the host machine running the assessment code.

| Attribute | Host Specification |
|---|---|
| **CPU** | 12th Gen Intel(R) Core(TM) i5-1235U (10 Cores: 2 Performance + 8 Efficient, 12 Logical Processors) |
| **RAM** | 8.00 GB Physical RAM (8,106,488 KB Visible Memory) |
| **Operating System** | Microsoft Windows 11 Home, Version 10.0.26300 |
| **Python Runtime** | Python 3.11.9 (AMD64) |
| **CVAT Cloned Commit SHA** | `4a09e27ff869b7aebbfdb07b29c4a34904a0221d` |
| **Sample Dataset** | COCO 2017 Validation Set (Detection) — 219 shapes across 12 taxonomy classes |

---

## 2. Measurable Objective Specification

| ID | Field | Entry |
|---|---|---|
| **MO-1** | **What is measured** | End-to-end round-trip latency of `GET /api/v1/tasks/1/annotations/analytics` computing per-class annotation counts directly from the database. |
| | **How** | Automated HTTP benchmark script (`benchmark.py`) recording high-precision timing via `time.perf_counter()` over 5 consecutive requests with `Cache-Control: no-cache`. |
| | **Target** | Median of 5 runs at or below **30.00 ms**. |
| | **Conditions** | Windows 11 Home, local Django server on port 8000, seeded COCO 2017 validation data (Task #1: 219 annotations across 12 classes), Token Authentication enabled, cache disabled. |
| | **Not included** | Initial cold-start process boot and DB connection handshake. |

### Justification of Target Number
The target threshold of **30.00 ms** was selected because real-time dashboards in CVAT require instantaneous feedback during task switching and filter toggling. A response time below 30 ms feels instantaneous to annotators (<100ms human perception threshold) while leaving ample headroom for client-side SVG rendering.

---

## 3. Raw Benchmark Execution Output

The raw output below was produced directly by `benchmark.py` running on the test machine:

```text
=== CVAT Annotation Analytics Benchmark (MO-1) ===
Target URL: http://127.0.0.1:8000/api/v1/tasks/1/annotations/analytics
Python: 3.11.9 on Windows 10

Executing 5 timed measurement runs:
  Run 1: 18.69 ms
  Run 2: 19.39 ms
  Run 3: 21.36 ms
  Run 4: 18.80 ms
  Run 5: 28.49 ms

=== Benchmark Results ===
Individual runs: [18.69, 19.39, 21.36, 18.8, 28.49] ms
Median: 19.39 ms
Min: 18.69 ms | Max: 28.49 ms
Spread: 9.80 ms
Target: <= 30.00 ms -> MET
```

---

## 4. Analysis & Result Summary

- **Target Threshold:** $\le 30.00\text{ ms}$
- **Achieved Median:** **$19.39\text{ ms}$**
- **Spread:** **$9.80\text{ ms}$** (Min: $18.69\text{ ms}$, Max: $28.49\text{ ms}$)
- **Status:** **TARGET MET** ($\Delta = -10.61\text{ ms}$ under target budget).

### Architectural Rationale & Discovery (Pertaining to Questions K3 & K4)
During initial benchmarking with HTTP `BasicAuthentication`, requests took $\sim 460\text{ ms}$ despite the database query executing in only $2.77\text{ ms}$. Investigation revealed that Django's `BasicAuthentication` re-evaluates `authenticate(username, password)` on *every* single HTTP request, invoking PBKDF2-SHA256 password hashing with 720,000 iterations.

By implementing `TokenAuthentication` (`Authorization: Token <key>`) and `SessionAuthentication` as utilized in CVAT's production frontend, credential verification became an O(1) indexed database/token lookup. This reduced API latency from $464\text{ ms}$ down to **$19.39\text{ ms}$**—a **$24\times$ speed improvement**.
