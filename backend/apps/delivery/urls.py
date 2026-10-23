from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("drivers", views.DriverViewSet, basename="driver")
router.register("deliveries", views.DeliveryViewSet, basename="delivery")
router.register("my/deliveries", views.MyDeliveryViewSet, basename="my-delivery")

urlpatterns = [path("", include(router.urls))]
