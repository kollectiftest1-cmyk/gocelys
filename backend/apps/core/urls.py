from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("audit", views.AuditLogViewSet, basename="audit")

urlpatterns = [
    path("settings/", views.settings_view),
    path("", include(router.urls)),
]
