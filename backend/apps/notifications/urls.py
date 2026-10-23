from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("notifications", views.NotificationViewSet, basename="notification")

urlpatterns = [
    path("devices/", views.register_device),
    path("", include(router.urls)),
]
