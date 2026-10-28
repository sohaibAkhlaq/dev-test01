# Copyright (C) 2026 xis.ai Technical Assessment
# SPDX-License-Identifier: MIT

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.authentication import SessionAuthentication, BasicAuthentication, TokenAuthentication
from django.core.exceptions import ObjectDoesNotExist
from django.http import Http404

from cvat.apps.engine.models import Task
from cvat.apps.test.services import compute_task_annotation_counts


class TaskAnnotationAnalyticsView(APIView):
    """
    API endpoint for Annotation Analytics per task.
    URL: /api/v1/tasks/{id}/annotations/analytics
    
    Security:
    - Enforces CVAT authentication (TokenAuth / SessionAuth / BasicAuth).
    - Unauthenticated requests are rejected with 401 Unauthorized.
    - Authenticated users without access to the task are rejected with 403 Forbidden.
    """
    authentication_classes = [TokenAuthentication, SessionAuthentication, BasicAuthentication]
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk: int):
        # 0. Check authentication explicitly (Requirement 5)
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required. Please log in to CVAT."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # 1. Fetch Task or return 404
        try:
            task = Task.objects.select_related('owner', 'project').get(pk=pk)
        except ObjectDoesNotExist:
            return Response(
                {"error": f"Task with ID {pk} does not exist."},
                status=status.HTTP_404_NOT_FOUND
            )

        # 2. Check task-level access authorization (Requirement 5)
        # Refuse access if user is not the owner, project owner, or assigned to a job
        if not task.has_user_access(request.user):
            return Response(
                {
                    "error": "Permission denied. You do not have permission to view analytics for this task.",
                    "task_id": pk,
                    "user": request.user.username,
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # 3. Parse optional filter parameters (Requirement 7)
        shape_type = request.query_params.get("shape_type", None)
        occluded_param = request.query_params.get("occluded", None)
        occluded = None
        if occluded_param is not None:
            occluded = occluded_param.lower() in ("true", "1", "yes")

        frame_from = request.query_params.get("frame_from", None)
        frame_to = request.query_params.get("frame_to", None)
        try:
            frame_from = int(frame_from) if frame_from is not None else None
            frame_to = int(frame_to) if frame_to is not None else None
        except ValueError:
            return Response(
                {"error": "Invalid frame filter parameters. frame_from and frame_to must be integers."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 4. Compute analytics directly from database
        try:
            analytics_data = compute_task_annotation_counts(
                task_id=task.id,
                shape_type=shape_type,
                occluded=occluded,
                frame_from=frame_from,
                frame_to=frame_to
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to compute annotation analytics: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(analytics_data, status=status.HTTP_200_OK)


class TaskListView(APIView):
    """
    Helper API endpoint listing accessible tasks for the frontend selector.
    """
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.is_superuser or request.user.is_staff:
            tasks = Task.objects.all()
        else:
            tasks = Task.objects.filter(owner=request.user)
            
        task_list = [
            {
                "id": t.id,
                "name": t.name,
                "mode": t.mode,
                "dimension": t.dimension,
                "owner": t.owner.username if t.owner else "unassigned",
                "created_date": t.created_date.isoformat(),
            }
            for t in tasks
        ]
        return Response(task_list, status=status.HTTP_200_OK)
