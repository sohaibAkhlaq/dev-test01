# Copyright (C) 2026 xis.ai Technical Assessment
# SPDX-License-Identifier: MIT

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from cvat.apps.engine.models import Task, Segment, Job, Label, LabeledShape, ShapeType
from cvat.apps.test.services import compute_task_annotation_counts


class AnnotationAnalyticsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.owner = User.objects.create_user(username="task_owner", password="password123")
        self.other_user = User.objects.create_user(username="other_user", password="password123")
        self.admin_user = User.objects.create_superuser(username="admin", password="password123", email="admin@cvat.local")

        # Task 1 (COCO Sample validation task)
        self.task1 = Task.objects.create(name="COCO 2017 Val Test Task", owner=self.owner)
        self.segment1 = Segment.objects.create(task=self.task1, start_frame=0, stop_frame=100)
        self.job1 = Job.objects.create(segment=self.segment1, assignee=self.owner)

        # Labels for Task 1
        self.label_person = Label.objects.create(task=self.task1, name="person", color="#FF3333")
        self.label_car = Label.objects.create(task=self.task1, name="car", color="#3399FF")
        self.label_dog = Label.objects.create(task=self.task1, name="dog", color="#33CC33")
        self.label_bicycle = Label.objects.create(task=self.task1, name="bicycle", color="#FF9933")

        # Seed LabeledShapes
        # 3 person rectangles, 1 person polygon
        for _ in range(3):
            LabeledShape.objects.create(
                job=self.job1,
                label=self.label_person,
                type=ShapeType.RECTANGLE,
                points="10,10,50,50"
            )
        LabeledShape.objects.create(
            job=self.job1,
            label=self.label_person,
            type=ShapeType.POLYGON,
            points="10,10,30,40,50,50"
        )

        # 2 car rectangles
        for _ in range(2):
            LabeledShape.objects.create(
                job=self.job1,
                label=self.label_car,
                type=ShapeType.RECTANGLE,
                points="100,100,200,200"
            )

        # 1 dog polygon
        LabeledShape.objects.create(
            job=self.job1,
            label=self.label_dog,
            type=ShapeType.POLYGON,
            points="5,5,15,15,25,25"
        )
        # bicycle has 0 annotations

        # Task 2 (Empty task with 0 annotations)
        self.task_empty = Task.objects.create(name="Empty Task Zero Annotations", owner=self.owner)
        self.segment_empty = Segment.objects.create(task=self.task_empty, start_frame=0, stop_frame=50)
        self.job_empty = Job.objects.create(segment=self.segment_empty, assignee=self.owner)
        self.label_empty_cat = Label.objects.create(task=self.task_empty, name="cat", color="#AA33FF")

    def test_anonymous_request_refused_with_401(self):
        """Requirement 5: Refuse a request with no login (401 Unauthorized)"""
        url = f"/api/v1/tasks/{self.task1.id}/annotations/analytics"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthorized_user_refused_with_403(self):
        """Requirement 5: Refuse a user who has no access to that task (403 Forbidden)"""
        self.client.force_authenticate(user=self.other_user)
        url = f"/api/v1/tasks/{self.task1.id}/annotations/analytics"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Permission denied", response.data["error"])

    def test_authorized_owner_access_succeeds_with_correct_counts(self):
        """Requirement 1: Returns correct counts per class read from database"""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/v1/tasks/{self.task1.id}/annotations/analytics"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.data
        self.assertEqual(data["task_id"], self.task1.id)
        self.assertEqual(data["total_annotations"], 7)  # 4 person + 2 car + 1 dog

        classes = {item["name"]: item["count"] for item in data["classes"]}
        self.assertEqual(classes["person"], 4)
        self.assertEqual(classes["car"], 2)
        self.assertEqual(classes["dog"], 1)
        self.assertEqual(classes["bicycle"], 0)  # Present in taxonomy with 0

    def test_empty_task_handles_cleanly(self):
        """Requirement 4: Handles no data case cleanly"""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/v1/tasks/{self.task_empty.id}/annotations/analytics"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.data
        self.assertEqual(data["total_annotations"], 0)
        self.assertEqual(len(data["classes"]), 1)
        self.assertEqual(data["classes"][0]["name"], "cat")
        self.assertEqual(data["classes"][0]["count"], 0)

    def test_nonexistent_task_returns_404(self):
        """Requirement 4: Handles failed request cleanly (404 Not Found)"""
        self.client.force_authenticate(user=self.owner)
        url = "/api/v1/tasks/999999/annotations/analytics"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("error", response.data)

    def test_filter_by_shape_type(self):
        """Requirement 7: Filter or grouping beyond plain count (shape_type=rectangle)"""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/v1/tasks/{self.task1.id}/annotations/analytics?shape_type=rectangle"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data["total_annotations"], 5)  # 3 person rect + 2 car rect
        classes = {item["name"]: item["count"] for item in data["classes"]}
        self.assertEqual(classes["person"], 3)
        self.assertEqual(classes["car"], 2)
        self.assertEqual(classes["dog"], 0)  # dog is polygon, so count is 0
