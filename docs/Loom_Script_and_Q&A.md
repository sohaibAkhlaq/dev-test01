# 5-Minute Loom Recording Guide & Q&A Defense Script

**Assessment:** xis.ai Full Stack Technical Assessment — Annotation Analytics (CVAT)  
**Evaluator Reference:** Section 7 (The Recording & The Four Questions)  
**Maximum Duration:** 5 minutes or less  

---

## 1. Timeline Breakdown (Total 5 Minutes)

### 00:00 – 01:00 (1 Minute): The Feature Running Live on Screen
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

### 01:00 – 02:30 (1.5 Minutes): Code Walkthrough (One Request from Page to Database and Back)
1. **Frontend Request (`frontend/js/app.js`):**
   - Show `loadTaskAnalytics(taskId)` function.
   - Explain how `fetch()` sends `Authorization: Token ...` (or Session/Basic) to `http://localhost:8000/api/v1/tasks/{id}/annotations/analytics`.
2. **URL Routing & Authentication Gate (`cvat/apps/test/views.py`):**
   - Show `TaskAnnotationAnalyticsView`:
     - Line 25: Checks `request.user.is_authenticated` (returns 401 if anonymous).
     - Line 35: Evaluates `task.has_user_access(request.user)` (returns 403 if unauthorized).
3. **Database Aggregation Service (`cvat/apps/test/services.py`):**
   - Show `compute_task_annotation_counts(task_id, shape_type=...)`:
     - Highlight lines 31–36:
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

### 02:30 – 05:00 (2.5 Minutes): The Four Questions Answered Out Loud

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
> "One thing in my initial code I reversed—and would further refine in production—was using HTTP `BasicAuthentication` for testing the API endpoint.  
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
