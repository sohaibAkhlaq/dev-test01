# Copyright (C) 2026 xis.ai Technical Assessment
# SPDX-License-Identifier: MIT

"""
Service layer for CVAT Annotation Analytics.
Contains direct database aggregation functions for per-class annotation counts.
"""

from typing import Dict, Any, Optional
from django.db.models import Count, Q
from django.core.exceptions import ObjectDoesNotExist
from cvat.apps.engine.models import Task, Label, LabeledShape, Job


def compute_task_annotation_counts(
    task_id: int,
    shape_type: Optional[str] = None,
    occluded: Optional[bool] = None,
    frame_from: Optional[int] = None,
    frame_to: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Computes per-class annotation counts for a given task directly in the database.
    
    Line 31 below performs the database aggregation using Django ORM.
    We place this in services.py rather than in the view or serializer to:
    1. Decouple database execution logic from HTTP transport / REST serialization.
    2. Allow reuse across both the REST API endpoint and WebSocket consumers.
    3. Ensure single database round-trip via SQL GROUP BY rather than in-memory looping.
    """
    task = Task.objects.select_related('project', 'owner').get(pk=task_id)

    # Base queryset for shapes belonging to all jobs under this task
    shapes_qs = LabeledShape.objects.filter(job__segment__task_id=task_id)

    # Apply optional filter (Requirement 7: Shape type geometry filter or occlusion filter)
    if shape_type and shape_type.strip():
        shapes_qs = shapes_qs.filter(type=shape_type.strip().lower())
    
    if occluded is not None:
        shapes_qs = shapes_qs.filter(occluded=occluded)

    if frame_from is not None:
        shapes_qs = shapes_qs.filter(frame__gte=frame_from)
    if frame_to is not None:
        shapes_qs = shapes_qs.filter(frame__lte=frame_to)

    # Database-level GROUP BY aggregation per label (computed at DB level)
    counts_by_label = (
        shapes_qs.values("label_id", "label__name", "label__color")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    # Retrieve all configured labels for the task (including those with 0 annotations)
    configured_labels = Label.objects.filter(
        Q(task=task) | (Q(project=task.project) if task.project else Q())
    ).values("id", "name", "color")

    # Map aggregate counts into dictionary for O(1) lookup
    counts_map = {item["label_id"]: item["count"] for item in counts_by_label}
    
    # Build complete class distribution including 0-count classes
    class_distribution = []
    total_annotations = 0

    for lbl in configured_labels:
        count = counts_map.get(lbl["id"], 0)
        total_annotations += count
        class_distribution.append({
            "label_id": lbl["id"],
            "name": lbl["name"],
            "color": lbl["color"],
            "count": count
        })

    # Sort descending by count, then alphabetically
    class_distribution.sort(key=lambda x: (-x["count"], x["name"]))

    # Calculate additional metrics (geometry breakdown)
    geometry_breakdown = list(
        shapes_qs.values("type")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    job_count = Job.objects.filter(segment__task=task).count()

    return {
        "task_id": task.id,
        "task_name": task.name,
        "owner_id": task.owner_id,
        "owner_username": task.owner.username if task.owner else None,
        "total_annotations": total_annotations,
        "job_count": job_count,
        "classes": class_distribution,
        "geometry_breakdown": geometry_breakdown,
        "filters_applied": {
            "shape_type": shape_type,
            "occluded": occluded,
            "frame_from": frame_from,
            "frame_to": frame_to,
        }
    }
