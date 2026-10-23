from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("users", views.UserViewSet, basename="user")
router.register("roles", views.RoleViewSet, basename="role")

urlpatterns = [
    path("login/", views.login),
    path("register/", views.register),
    path("refresh/", TokenRefreshView.as_view()),
    path("logout/", views.logout),
    path("pin/", views.verify_pin),
    path("me/", views.MeView.as_view()),
    path("", include(router.urls)),
]
