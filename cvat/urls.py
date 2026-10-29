from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.views.static import serve
from django.views.generic import TemplateView

REACT_DIST = settings.BASE_DIR / 'frontend-react' / 'dist'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('cvat.apps.test.urls')),
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': str(REACT_DIST / 'assets')}),
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
]
