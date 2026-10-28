from django.apps import AppConfig

class TestConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cvat.apps.test'
    verbose_name = 'Annotation Analytics Test App'
