from django.apps import AppConfig

class EngineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cvat.apps.engine'
    verbose_name = 'CVAT Engine'
