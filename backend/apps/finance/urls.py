from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("payment-methods", views.PaymentMethodViewSet, basename="payment-method")
router.register("finance/categories", views.FinanceCategoryViewSet, basename="finance-category")
router.register("finance/transactions", views.TransactionViewSet, basename="transaction")
router.register("expenses", views.ExpenseViewSet, basename="expense")
router.register("charges", views.RecurringChargeViewSet, basename="charge")
router.register("dues", views.DueViewSet, basename="due")

urlpatterns = [
    path("finance/treasury/", views.treasury),
    path("", include(router.urls)),
]
