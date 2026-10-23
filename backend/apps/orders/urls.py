from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("orders", views.OrderViewSet, basename="order")
router.register("customers", views.CustomerViewSet, basename="customer")
router.register("shop/orders", views.ShopOrderViewSet, basename="shop-order")
router.register("shop/addresses", views.ShopAddressViewSet, basename="shop-address")

urlpatterns = [
    path("public/home/", views.public_home),
    path("shop/bootstrap/", views.shop_bootstrap),
    path("shop/catalog/", views.shop_catalog),
    path("shop/promo/", views.shop_promo),
    path("shop/profile/", views.shop_profile),
    path("", include(router.urls)),
]
