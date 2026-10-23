from django.contrib import admin

from . import models

admin.site.register(models.PaymentMethod)
admin.site.register(models.FinanceCategory)
admin.site.register(models.FinancialTransaction)
admin.site.register(models.Expense)
admin.site.register(models.RecurringCharge)
admin.site.register(models.Due)
