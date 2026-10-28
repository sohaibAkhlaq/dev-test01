# Implementation Plan: Annotation Analytics for CVAT

**Candidate Branch:** `dev-test01`  
**Assessment:** xis.ai Full Stack Technical Assessment — Annotation Analytics (CVAT)  
**Allocated Time Window:** 8 hours  

---

## 1. Executive Summary & Order of Execution

This plan outlines the systematic engineering execution to deliver an end-to-end Annotation Analytics capability within CVAT. The goal is to provide granular visibility into dataset class distributions, real-time update streaming, robust error/empty state recovery, and measurable backend speed.

The work is sequenced strictly according to Section 3 of the assessment specification:
1. Floor requirements (Items 1–4): Backend aggregation API, web interface page, graph visualization, empty/error state handling.
2. Security & Access Control (Item 5): CVAT authentication enforcement and task-level permission boundaries.
3. Measurement & Performance (Item 6): Establish measurable speed target MO-1, execute 5 runs, report median and spread.
4. Advanced Filter/Grouping (Item 7): Shape geometry filter (`shape_type` parameter) with architectural justification.
5. Real-Time Streaming & Resilience (Items 8–9): WebSocket live broadcast of annotation mutations and graceful auto-reconnection.
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
| **Phase 8** | Benchmarking, DOD Verification & Loom Prep | 1.25 hr | Run 5 automated latency runs, compile `docs/Objectives.md`, complete `docs/Definition of Done.md` with evidence, and verify answers to K1–K4. |
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
   - *Why Rejected:* A task with 50,000 shapes would transmit 20–50 MB of raw coordinate floats over the network. This causes massive memory spikes in the browser, mobile lag, and multi-second page loads.
   - *Cost of Rejecting:* Requires a dedicated backend endpoint and custom SQL aggregation logic instead of reusing the generic annotation serializer.
   
2. **Pre-computed Denormalized Counters (Maintaining counter columns on the `Label` or `Task` table on every save/delete):**
   - *Why Rejected:* CVAT supports bulk annotation imports (e.g. COCO 1.0 upload with thousands of boxes) and multi-user parallel editing. Keeping denormalized counters synchronized during bulk operations introduces race conditions, database row-locking contention, and cache invalidation bugs.
   - *Cost of Rejecting:* Queries run dynamically on request rather than reading an O(1) integer field. However, indexed SQL `GROUP BY` on foreign keys executes in under 15ms even for large datasets.

3. **Background Periodic Batch Aggregation (Celery/Cron worker):**
   - *Why Rejected:* Counts would be stale and would not reflect immediate changes made by annotators in active jobs.
   - *Cost of Rejecting:* Server computes counts on demand, mitigated by database indexes on `job_id` and `label_id`.
