from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    """Sonde de santé utilisée par le déploiement : vérifie aussi l'accès à la base."""
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({"status": "error", "service": "gocelsys-api", "database": str(exc)[:200]}, status=503)
    return JsonResponse({"status": "ok", "service": "gocelsys-api", "database": "ok"})


admin.site.site_header = "Gocelsys — Administration technique"
admin.site.site_title = "Gocelsys"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.agencies.urls")),
    path("api/", include("apps.catalog.urls")),
    path("api/", include("apps.inventory.urls")),
    path("api/", include("apps.sales.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.delivery.urls")),
    path("api/", include("apps.finance.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.reports.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
