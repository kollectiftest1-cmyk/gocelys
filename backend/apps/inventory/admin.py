from django.contrib import admin

from . import models

admin.site.register(models.StockBalance)
admin.site.register(models.StockMovement)
admin.site.register(models.Transfer)
admin.site.register(models.TransferLine)
admin.site.register(models.InventoryCount)
admin.site.register(models.InventoryLine)
