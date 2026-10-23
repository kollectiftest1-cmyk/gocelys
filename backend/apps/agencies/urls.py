from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("agencies", views.AgencyViewSet, basename="agency")
router.register("pos", views.PointOfSaleViewSet, basename="pos")
router.register("zones", views.DeliveryZoneViewSet, basename="zone")

urlpatterns = [path("", include(router.urls))]
