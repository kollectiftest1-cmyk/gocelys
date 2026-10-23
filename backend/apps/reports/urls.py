from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.dashboard),
    path("reports/<str:kind>/", views.report),
]
