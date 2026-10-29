# Copyright (C) 2026 xis.ai Technical Assessment
# SPDX-License-Identifier: MIT

"""
Seeds realistic sample data including public COCO 2017 validation classes and annotations.
Creates test users with different permission levels for testing access control.
"""

import os
import django
import random

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cvat.settings")
django.setup()

from django.contrib.auth.models import User
from cvat.apps.engine.models import Task, Segment, Job, Label, LabeledShape, ShapeType, Project


def seed_database():
    print("=== Seeding CVAT Annotation Analytics Database ===")

    # 1. Users
    admin, _ = User.objects.get_or_create(username="admin", defaults={"email": "admin@cvat.local", "is_staff": True, "is_superuser": True})
    admin.set_password("admin123")
    admin.save()

    annotator, _ = User.objects.get_or_create(username="annotator_lead", defaults={"email": "lead@cvat.local"})
    annotator.set_password("pass123")
    annotator.save()

    guest, _ = User.objects.get_or_create(username="unauthorized_guest", defaults={"email": "guest@cvat.local"})
    guest.set_password("pass123")
    guest.save()
    print("[OK] Created test users: admin (superuser), annotator_lead (task owner), unauthorized_guest")

    # 2. Project
    project, _ = Project.objects.get_or_create(
        name="Autonomous Perception & Object Detection 2026",
        defaults={"owner": annotator, "status": "annotation"}
    )

    # 3. Task 1: COCO 2017 Val Benchmark
    task1, created = Task.objects.get_or_create(
        name="COCO 2017 Validation Set (Detection)",
        defaults={"owner": annotator, "project": project, "mode": "annotation", "dimension": "2d"}
    )
    if created:
        segment1 = Segment.objects.create(task=task1, start_frame=0, stop_frame=500)
        job1 = Job.objects.create(segment=segment1, assignee=annotator, status="annotation", stage="annotation")
        
        # Standard COCO 2017 Classes with hex palette
        coco_classes = [
            ("person", "#FF3B30", 48),
            ("car", "#007AFF", 34),
            ("bicycle", "#34C759", 19),
            ("motorcycle", "#AF52DE", 12),
            ("dog", "#FF9500", 22),
            ("cat", "#FF2D55", 15),
            ("traffic light", "#FFCC00", 28),
            ("bus", "#5856D6", 9),
            ("truck", "#5AC8FA", 14),
            ("backpack", "#8E8E93", 11),
            ("umbrella", "#30B0C7", 7),
            ("handbag", "#A2845E", 0),  # 0 annotations to test 0-count in taxonomy
        ]

        random.seed(42)  # Deterministic seed for reproducible evaluation metrics
        for name, color, count in coco_classes:
            lbl = Label.objects.create(task=task1, name=name, color=color, type="any")
            for i in range(count):
                shape_type = random.choice([
                    ShapeType.RECTANGLE, ShapeType.RECTANGLE, ShapeType.RECTANGLE, # Mostly boxes in COCO
                    ShapeType.POLYGON, ShapeType.POINTS
                ])
                frame = random.randint(0, 499)
                x1 = random.randint(20, 600)
                y1 = random.randint(20, 400)
                w = random.randint(30, 200)
                h = random.randint(30, 200)
                points_str = f"{x1},{y1},{x1+w},{y1+h}"
                
                LabeledShape.objects.create(
                    job=job1,
                    label=lbl,
                    frame=frame,
                    type=shape_type,
                    occluded=random.choice([False, False, True]),
                    points=points_str
                )
        print(f"[OK] Created Task 1 (ID: {task1.id}): {task1.name} with COCO 2017 classes and 219 shapes")

    # 4. Task 2: Empty Task (Zero Annotations for Edge Case Testing)
    task2, created2 = Task.objects.get_or_create(
        name="Empty Video Stream (Zero Annotations)",
        defaults={"owner": annotator, "project": project, "mode": "annotation", "dimension": "2d"}
    )
    if created2:
        seg2 = Segment.objects.create(task=task2, start_frame=0, stop_frame=100)
        Job.objects.create(segment=seg2, assignee=annotator)
        Label.objects.create(task=task2, name="pedestrian", color="#FF3B30")
        Label.objects.create(task=task2, name="vehicle", color="#007AFF")
        print(f"[OK] Created Task 2 (ID: {task2.id}): {task2.name} (0 annotations)")

    # 5. Task 3: High Density Urban Drone Footage
    task3, created3 = Task.objects.get_or_create(
        name="Urban Drone Aerial Survey 4K",
        defaults={"owner": annotator, "project": project, "mode": "annotation", "dimension": "2d"}
    )
    if created3:
        seg3 = Segment.objects.create(task=task3, start_frame=0, stop_frame=250)
        job3 = Job.objects.create(segment=seg3, assignee=annotator)
        labels_t3 = [
            ("sedan", "#0A84FF", 65),
            ("suv", "#30D158", 42),
            ("pedestrian", "#FF453A", 88),
            ("cyclist", "#FFD60A", 24),
            ("van", "#BF5AF2", 18),
        ]
        for name, color, count in labels_t3:
            lbl = Label.objects.create(task=task3, name=name, color=color)
            for _ in range(count):
                LabeledShape.objects.create(
                    job=job3,
                    label=lbl,
                    frame=random.randint(0, 249),
                    type=ShapeType.RECTANGLE,
                    points="50,50,150,150"
                )
        print(f"[OK] Created Task 3 (ID: {task3.id}): {task3.name} with 237 annotations")

    print("\nDatabase seeding completed successfully.")

if __name__ == "__main__":
    seed_database()
