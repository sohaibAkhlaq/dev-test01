from django.urls import path
from cvat.apps.test.views import TaskAnnotationAnalyticsView, TaskListView

urlpatterns = [
    path('tasks/<int:pk>/annotations/analytics', TaskAnnotationAnalyticsView.as_view(), name='task-annotation-analytics'),
    path('tasks/', TaskListView.as_view(), name='task-list'),
]
