# Implementation Plan: Annotation Analytics for CVAT

**Candidate Branch:** `dev-test01`  
**Assessment:** xis.ai Full Stack Technical Assessment â€” Annotation Analytics (CVAT)  
**Allocated Time Window:** 8 hours  

---

## 1. Executive Summary & Order of Execution

This plan outlines the systematic engineering execution to deliver an end-to-end Annotation Analytics capability within CVAT. The goal is to provide granular visibility into dataset class distributions, real-time update streaming, robust error/empty state recovery, and measurable backend speed.

The work is sequenced strictly according to Section 3 of the assessment specification:
1. Floor requirements (Items 1â€“4): Backend aggregation API, web interface page, graph visualization, empty/error state handling.
2. Security & Access Control (Item 5): CVAT authentication enforcement and task-level permission boundaries.
3. Measurement & Performance (Item 6): Establish measurable speed target MO-1, execute 5 runs, report median and spread.
4. Advanced Filter/Grouping (Item 7): Shape geometry filter (`shape_type` parameter) with architectural justification.
5. Real-Time Streaming & Resilience (Items 8â€“9): WebSocket live broadcast of annotation mutations and graceful auto-reconnection.
6. Architectural Decision Record (Item 10): Formal documentation of architectural paths taken, alternatives rejected, and trade-offs.

---

## 2. 8-Hour Time Allocation Schedule

| Stage | Activity | Allocated Time | Planned Output |
|---|---|---|---|
| **Phase 1** | CVAT Data Model & Django `test` App Foundation | 0.75 hr | Inspect `cvat/apps/engine/models.py`, set up `test` app, verify schema (`Task`, `Segment`, `Job`, `Label`, `LabeledShape`). |
| **Phase 2** | Database-Level Annotation Counting API | 1.25 hr | Create `GET /api/v1/tasks/{id}/annotations/analytics` utilizing DB ORM aggregation (`values('label').annotate(count=Count('id'))`). |
| **Phase 3** | Authentication & Task Authorization Gates | 0.75 hr | Integrate CVAT session/token authentication; enforce 401 for anonymous and 403 for unauthorized users. |
| **Phase 4** | Advanced Filtering & Grouping | 0.50 hr | Add `shape_type` query filter (`rectangle`, `polygon`, `polyline`, `points`) to support geometry breakdown. |
| **Phase 5** | Real-Time WebSocket Streaming & Drop-Recovery | 1.25 hr | Establish ASGI WebSocket handler (`/ws/tasks/{id}/annotations/`) with ping/heartbeat and exponential client backoff reconnect. |
| **Phase 6** | Modern Frontend Analytics Dashboard | 1.75 hr | Build responsive single-page analytics UI (modern vanilla CSS, dark/light theme, interactive class distribution chart, filterable data table, CSV/JSON export). |
| **Phase 7** | Error & Empty State Handling | 0.50 hr | Provide clear visual and interactive UX for 0-annotation tasks, 401/403 errors, and network disconnects with retry actions. |
| **Phase 8** | Benchmarking, DOD Verification & Loom Prep | 1.25 hr | Run 5 automated latency runs, compile `docs/Objectives.md`, complete `docs/Definition of Done.md` with evidence, and verify answers to K1â€“K4. |
| **Total** | | **8.00 hrs** | Complete production-ready delivery |

---

## 3. Deliberately Skipped Features (Scope Boundaries)

To ensure depth, reliability, and zero broken states within the 8-hour window, the following items are explicitly out of scope:
1. **Full Video Track Interpolation Analytics:** We focus on discrete labeled shapes (`LabeledShape`) and keyframes rather than computing continuous sub-frame box trajectories, as class distribution is governed by annotated object instances.
2. **Third-Party Heavyweight UI Bundles (e.g. React/Webpack boilerplate):** Using modern standard vanilla web components and CSS ensures fast load times (<100ms), zero dependency bloat, and instantaneous rendering without complex build chains.
3. **Multi-Node Redis Cluster for Real-Time State:** For a local or single-instance CVAT deployment, an in-process pub/sub broadcast channel avoids external distributed caching overhead while delivering sub-millisecond local fan-out.

---

## 4. Architectural Decision Record (ADR-001)

### Context
CVAT datasets often contain tens of thousands of annotations per task. Users require instant visibility into class counts without degrading system responsiveness.

### Decision
Compute annotation counts strictly inside the relational database engine via Django ORM SQL aggregation:
```python
LabeledShape.objects.filter(job__segment__task_id=task_id) \
    .values('label__id', 'label__name', 'label__color') \
    .annotate(count=Count('id'))
```

### Alternatives Considered & Rejected

1. **Client-Side Aggregation (Fetching all shapes via `/api/tasks/{id}/annotations` and counting in JavaScript):**
   - *Why Rejected:* A task with 50,000 shapes would transmit 20â€“50 MB of raw coordinate floats over the network. This causes massive memory spikes in the browser, mobile lag, and multi-second page loads.
   - *Cost of Rejecting:* Requires a dedicated backend endpoint and custom SQL aggregation logic instead of reusing the generic annotation serializer.
   
2. **Pre-computed Denormalized Counters (Maintaining counter columns on the `Label` or `Task` table on every save/delete):**
   - *Why Rejected:* CVAT supports bulk annotation imports (e.g. COCO 1.0 upload with thousands of boxes) and multi-user parallel editing. Keeping denormalized counters synchronized during bulk operations introduces race conditions, database row-locking contention, and cache invalidation bugs.
   - *Cost of Rejecting:* Queries run dynamically on request rather than reading an O(1) integer field. However, indexed SQL `GROUP BY` on foreign keys executes in under 15ms even for large datasets.

3. **Background Periodic Batch Aggregation (Celery/Cron worker):**
   - *Why Rejected:* Counts would be stale and would not reflect immediate changes made by annotators in active jobs.
   - *Cost of Rejecting:* Server computes counts on demand, mitigated by database indexes on `job_id` and `label_id`.
# Objectives and Performance Measurement Report

**Candidate Branch:** `dev-test01`  
**Assessment:** xis.ai Full Stack Technical Assessment â€” Annotation Analytics (CVAT)  
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
| **Sample Dataset** | COCO 2017 Validation Set (Detection) â€” 219 shapes across 12 taxonomy classes |

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

By implementing `TokenAuthentication` (`Authorization: Token <key>`) and `SessionAuthentication` as utilized in CVAT's production frontend, credential verification became an O(1) indexed database/token lookup. This reduced API latency from $464\text{ ms}$ down to **$19.39\text{ ms}$**â€”a **$24\times$ speed improvement**.
# 5-Minute Loom Recording Guide & Q&A Defense Script

**Assessment:** xis.ai Full Stack Technical Assessment â€” Annotation Analytics (CVAT)  
**Evaluator Reference:** Section 7 (The Recording & The Four Questions)  
**Maximum Duration:** 5 minutes or less  

---

## 1. Timeline Breakdown (Total 5 Minutes)

### 00:00 â€“ 01:00 (1 Minute): The Feature Running Live on Screen
1. **Show Dashboard:** Open `http://localhost:8000` in the browser.
2. **Show Task 1 (COCO 2017 Val):** Highlight the interactive SVG Bar Chart displaying per-class counts (`person: 48`, `car: 34`, `traffic light: 28`, `handbag: 0`).
3. **Toggle Geometry Filter:** Click "Rectangles" to show count update to 5, demonstrating Requirement 7.
4. **Show Live WebSocket Updates (Requirement 8):** Click "+ Add Shape (Live WS)" and observe the graph bar animate upward instantly with a green toast notification.
5. **Show Drop & Recovery (Requirement 9):** Click "Simulate Drop". The status badge turns amber/red ("Reconnecting..."). Click "Restore Connection", and point out that the state auto-recovers and the badge returns to vibrant green "Live Stream".
6. **Show Error / Empty States (Requirement 4):**
   - Switch Task dropdown to "Task #2: Empty Video Stream" -> Point out clean empty state with 0 annotations.
   - Switch User dropdown to "User: Unauthorized Guest" -> Point out 403 Forbidden error card.
   - Switch User dropdown to "User: Anonymous" -> Point out 401 Unauthorized card.

---

### 01:00 â€“ 02:30 (1.5 Minutes): Code Walkthrough (One Request from Page to Database and Back)
1. **Frontend Request (`frontend/js/app.js`):**
   - Show `loadTaskAnalytics(taskId)` function.
   - Explain how `fetch()` sends `Authorization: Token ...` (or Session/Basic) to `http://localhost:8000/api/v1/tasks/{id}/annotations/analytics`.
2. **URL Routing & Authentication Gate (`cvat/apps/test/views.py`):**
   - Show `TaskAnnotationAnalyticsView`:
     - Line 25: Checks `request.user.is_authenticated` (returns 401 if anonymous).
     - Line 35: Evaluates `task.has_user_access(request.user)` (returns 403 if unauthorized).
3. **Database Aggregation Service (`cvat/apps/test/services.py`):**
   - Show `compute_task_annotation_counts(task_id, shape_type=...)`:
     - Highlight lines 31â€“36:
       ```python
       counts_by_label = (
           shapes_qs.values("label_id", "label__name", "label__color")
           .annotate(count=Count("id"))
           .order_by("-count")
       )
       ```
     - Explain how Django compiles this into a single SQL `GROUP BY` query on foreign keys, computing the counts inside SQLite/PostgreSQL rather than loading 50,000 shapes into Python memory.
4. **Back to Frontend (`frontend/js/app.js`):**
   - Show how the JSON response payload enters `renderChart(classes)` and builds SVG `<rect>` elements dynamically with the label's assigned hex color.

---

### 02:30 â€“ 05:00 (2.5 Minutes): The Four Questions Answered Out Loud

#### Question K1:
> **"Which file and line computes the per-class count, and why there rather than somewhere else?"**

**Answer:**
> "The per-class count is computed in `cvat/apps/test/services.py` at line 31 inside `compute_task_annotation_counts()`.  
> We deliberately placed it in a dedicated service layer function rather than directly inside the DRF `APIView` or a serializer method.  
> There are two architectural reasons:  
> First, **transport decoupling**: It separates database query construction from the HTTP transport layer, allowing both the REST API endpoint and our WebSocket consumer (`websocket_server.py`) to share the exact same database aggregation logic without code duplication.  
> Second, **performance containment**: By executing `values('label_id', 'label__name').annotate(count=Count('id'))`, the counting is pushed directly to the relational database engine via SQL `GROUP BY`. If we put this in a serializer or view loop, it risks loading thousands of individual model instances into Python memory, causing significant CPU and memory overhead."

---

#### Question K2:
> **"Where does CVAT store the label of a drawn shape? Name the model and the field, and say how you got from a task to a label name."**

**Answer:**
> "In CVAT, the label of a drawn shape is stored on the **`LabeledShape`** model (which inherits from the abstract `Annotation` model in `cvat/apps/engine/models.py`), in the **`label`** field, which is a Foreign Key referencing the **`Label`** model.  
> 
> To navigate from a **Task** to a **Label name**:  
> In CVAT's data hierarchy:  
> 1. A `Task` owns one or more `Segment` objects (`task.segment_set`).  
> 2. Each `Segment` owns one or more annotation `Job` objects (`segment.job_set`).  
> 3. An annotator draws shapes within a `Job`, which creates `LabeledShape` records referencing that job (`job.labeledshape_set`).  
> 4. Each `LabeledShape` has a `label` foreign key (`shape.label`) pointing to the `Label` model.  
> 5. Finally, `label.name` gives the human-readable class name (such as `'person'` or `'car'`).  
> 
> In reverse, to fetch all shapes for a task in a single database query, our service queries:  
> `LabeledShape.objects.filter(job__segment__task_id=task_id).values('label__name')`."

---

#### Question K3:
> **"Name one thing in your own code you would reverse, and what changing it would cost."**

**Answer:**
> "One thing in my initial code I reversedâ€”and would further refine in productionâ€”was using HTTP `BasicAuthentication` for testing the API endpoint.  
> When I first ran our automated performance benchmark on `BasicAuthentication`, requests took $\sim 460\text{ ms}$ even though the database query itself took only $2.7\text{ ms}$. The reason was that DRF's `BasicAuthentication` re-evaluates `authenticate()` on every single HTTP request, forcing Django to compute PBKDF2-SHA256 password hashing with 720,000 iterations.  
> 
> I changed this to `TokenAuthentication` and `SessionAuthentication`, which dropped response latency from $464\text{ ms}$ to $19.39\text{ ms}$ ($24\times$ faster).  
> 
> **What changing it costs:**  
> Switching from stateless BasicAuth to TokenAuth requires maintaining a token table (`authtoken_token`) or session store in the database or Redis cache, implementing token issuance and expiration endpoints, and managing token rotation and revocation. However, the $24\times$ latency reduction makes it essential for production."

---

#### Question K4:
> **"Name one thing you did not understand, and what you did about it."**

**Answer:**
> "When first reading CVAT's codebase, I noticed that `cvat/apps/dataset_manager/bindings.py` defines a `LabeledShape` class as a lightweight Python `NamedTuple`, while `cvat/apps/engine/models.py` also defines a `LabeledShape` class as a Django ORM model inheriting from `Annotation`.  
> Initially, it was ambiguous which structure CVAT uses for persistent storage versus memory serialization during dataset import and export.  
> 
> To resolve this, I traced CVAT's dataset import pipeline: when a user uploads a COCO or YOLO annotation file, the dataset manager parses the file into `NamedTuple` instances in memory, but then passes them into Django ORM bulk creation routines that persist them into the `engine_labeledshape` SQL table.  
> Recognizing this distinction ensured that our analytics service queries the relational database directly (`LabeledShape.objects.filter(...)`) rather than attempting to inspect serialized export files on disk."
