from django.contrib import admin

from . import models

admin.site.register(models.CashSession)
admin.site.register(models.Sale)
admin.site.register(models.SaleLine)
admin.site.register(models.SalePayment)
admin.site.register(models.SyncOperation)
