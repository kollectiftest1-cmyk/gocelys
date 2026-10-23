from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("sales", views.SaleViewSet, basename="sale")
router.register("cash-sessions", views.CashSessionViewSet, basename="cash-session")

urlpatterns = [
    path("sync/push/", views.sync_push),
    path("sync/pull/", views.sync_pull),
    path("", include(router.urls)),
]
