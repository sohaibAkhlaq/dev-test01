# Copyright (C) 2018-2022 Intel Corporation
# Copyright (C) CVAT.ai Corporation
# SPDX-License-Identifier: MIT

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class ShapeType(models.TextChoices):
    RECTANGLE = 'rectangle', 'Rectangle'
    POLYGON = 'polygon', 'Polygon'
    POLYLINE = 'polyline', 'Polyline'
    POINTS = 'points', 'Points'
    CUBOID = 'cuboid', 'Cuboid'
    ELLIPSE = 'ellipse', 'Ellipse'
    MASK = 'mask', 'Mask'
    SKELETON = 'skeleton', 'Skeleton'


class SourceType(models.TextChoices):
    MANUAL = 'manual', 'Manual'
    AUTO = 'auto', 'Auto'


class Project(models.Model):
    name = models.CharField(max_length=256)
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="projects")
    status = models.CharField(max_length=32, default="annotation")
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.id}: {self.name}"


class Task(models.Model):
    name = models.CharField(max_length=256)
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.CASCADE, related_name="tasks")
    mode = models.CharField(max_length=32, default="annotation")
    dimension = models.CharField(max_length=8, default="2d")
    status = models.CharField(max_length=32, default="annotation")
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Task {self.id}: {self.name}"

    def has_user_access(self, user: User) -> bool:
        """
        Check if user has permission to access this task.
        In CVAT, task owner, project owner, assignees, or superusers have access.
        """
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.is_staff:
            return True
        if self.owner == user:
            return True
        if self.project and self.project.owner == user:
            return True
        # Check if user is an assignee in any of the task's jobs
        return Job.objects.filter(segment__task=self, assignee=user).exists()


class Segment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="segment_set")
    start_frame = models.IntegerField(default=0)
    stop_frame = models.IntegerField(default=0)
    type = models.CharField(max_length=32, default="range")

    def __str__(self):
        return f"Segment {self.id} (Task {self.task_id}: {self.start_frame}-{self.stop_frame})"


class Job(models.Model):
    segment = models.ForeignKey(Segment, on_delete=models.CASCADE, related_name="job_set")
    assignee = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_jobs")
    status = models.CharField(max_length=32, default="annotation")
    stage = models.CharField(max_length=32, default="annotation")
    state = models.CharField(max_length=32, default="new")
    type = models.CharField(max_length=32, default="annotation")
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Job {self.id} (Task {self.segment.task_id})"


class Label(models.Model):
    task = models.ForeignKey(Task, null=True, blank=True, on_delete=models.CASCADE, related_name="label_set")
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.CASCADE, related_name="label_set")
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=8, default="#3366ff")
    type = models.CharField(max_length=32, default="any")

    class Meta:
        unique_together = (("task", "name"),)

    def __str__(self):
        return self.name


class Annotation(models.Model):
    id = models.BigAutoField(primary_key=True)
    job = models.ForeignKey(Job, on_delete=models.CASCADE)
    label = models.ForeignKey(Label, on_delete=models.CASCADE)
    group = models.PositiveIntegerField(null=True, blank=True)
    source = models.CharField(max_length=16, choices=SourceType.choices, default=SourceType.MANUAL)

    class Meta:
        abstract = True


class LabeledShape(Annotation):
    """
    CVAT LabeledShape database model.
    Stores individual drawn annotation geometries (rectangles, polygons, etc.)
    associated with a specific job and labeled class.
    """
    frame = models.PositiveIntegerField(default=0)
    type = models.CharField(max_length=16, choices=ShapeType.choices, default=ShapeType.RECTANGLE)
    occluded = models.BooleanField(default=False)
    outside = models.BooleanField(default=False)
    z_order = models.IntegerField(default=0)
    points = models.TextField(default="")  # Serialized float coordinate sequence e.g. "120,45,300,250"
    rotation = models.FloatField(default=0.0)

    class Meta:
        indexes = [
            models.Index(fields=["job", "label"]),
            models.Index(fields=["frame"]),
            models.Index(fields=["type"]),
        ]

    def __str__(self):
        return f"Shape {self.id}: {self.label.name} ({self.type}) on Job {self.job_id} Frame {self.frame}"


class LabeledTrack(Annotation):
    """
    CVAT LabeledTrack database model for tracking objects across frames.
    """
    frame = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Track {self.id}: {self.label.name} on Job {self.job_id}"
