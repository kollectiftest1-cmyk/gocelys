from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("stock/movements", views.StockMovementViewSet, basename="movement")
router.register("transfers", views.TransferViewSet, basename="transfer")
router.register("inventories", views.InventoryViewSet, basename="inventory")

urlpatterns = [
    path("stock/levels/", views.stock_levels),
    path("stock/operations/", views.stock_operation),
    path("", include(router.urls)),
]
