import calendar
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.utils import fmt_money
from apps.core import audit
from apps.core.api import BusinessError
from apps.core.models import Sequence, Setting

from .models import Due, Expense, FinanceCategory, FinancialTransaction, RecurringCharge

D = Decimal


def to_cdf(amount, currency):
    if currency == "USD":
        return (D(amount) * D(str(Setting.get("usd_rate", 2850)))).quantize(D("0.01"))
    return D(amount)


def category(code):
    return FinanceCategory.objects.filter(code=code).first()


def record(*, direction, source, amount, agency, currency="CDF", method=None, user=None,
           label="", category_code=None, cash_session=None, source_id="", external_reference="",
           occurred_at=None, reference=None):
    amount = D(amount)
    if amount <= 0:
        raise BusinessError("Le montant d'une transaction doit être positif.")
    return FinancialTransaction.objects.create(
        reference=reference or Sequence.next("FIN", agency.code),
        direction=direction, source=source, amount=amount, currency=currency,
        amount_cdf=to_cdf(amount, currency), agency=agency, method=method, user=user,
        label=label[:200], category=category(category_code) if category_code else None,
        cash_session=cash_session, source_id=str(source_id), external_reference=external_reference,
        occurred_at=occurred_at or timezone.now(),
    )


# --------------------------------------------------------------------------- dépenses
@transaction.atomic
def create_expense(*, user, data):
    threshold = D(str(Setting.get("expense_approval_threshold", 200000)))
    expense = Expense(**data)
    expense.reference = Sequence.next("DEP", expense.agency.code)
    expense.created_by = user
    needs_approval = to_cdf(expense.amount, expense.currency) > threshold
    can_approve = user.has_code("expenses.approve", expense.agency_id)
    expense.status = Expense.Status.PENDING if (needs_approval and not can_approve) else Expense.Status.APPROVED
    if expense.status == Expense.Status.APPROVED:
        expense.approved_by, expense.approved_at = user, timezone.now()
    expense.save()
    audit.log(user, "expense.create", "expense", expense, after=audit.snapshot(expense, ["amount", "currency", "reason", "status"]))
    if expense.status == Expense.Status.PENDING:
        from apps.notifications.services import notify_perm

        notify_perm("expenses.approve", expense.agency, kind="expense_large", level="warning",
                    title="Dépense à valider",
                    body=f"{expense.category.name} — {fmt_money(expense.amount, expense.currency)} ({expense.agency.name})",
                    link=f"/finances/depenses?ref={expense.reference}")
    return expense


@transaction.atomic
def approve_expense(expense, user, approve=True, reason=""):
    if expense.status != Expense.Status.PENDING:
        raise BusinessError("Cette dépense n'est pas en attente de validation.")
    if approve:
        expense.status, expense.approved_by, expense.approved_at = Expense.Status.APPROVED, user, timezone.now()
    else:
        expense.status, expense.rejection_reason = Expense.Status.REJECTED, reason
    expense.save()
    audit.log(user, "expense.approve" if approve else "expense.reject", "expense", expense, note=reason)
    return expense


@transaction.atomic
def pay_expense(expense, user, method=None, cash_session=None):
    if expense.status != Expense.Status.APPROVED:
        raise BusinessError("Seule une dépense validée peut être payée.")
    if cash_session is not None and cash_session.status != "open":
        raise BusinessError("La caisse choisie n'est pas ouverte.")
    tx = record(direction="out", source=FinancialTransaction.Source.EXPENSE, amount=expense.amount,
                currency=expense.currency, agency=expense.agency, method=method or expense.method, user=user,
                label=f"{expense.category.name} — {expense.reason}", category_code=expense.category.code,
                cash_session=cash_session, source_id=expense.pk)
    expense.transaction, expense.status = tx, Expense.Status.PAID
    expense.paid_from_cash = cash_session
    expense.save()
    audit.log(user, "expense.pay", "expense", expense)
    return expense


# --------------------------------------------------------------------------- échéances
def _add_months(day, months, due_day=None):
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return day.replace(year=year, month=month, day=min(due_day or day.day, last))


def occurrences(charge, until):
    """Dates d'échéance de la charge entre son début et `until` (inclus)."""
    current = charge.start_date
    if charge.due_day and charge.frequency in {"monthly", "quarterly", "yearly"}:
        last = calendar.monthrange(current.year, current.month)[1]
        current = current.replace(day=min(charge.due_day, last))
        if current < charge.start_date:
            current = _add_months(current, 1, charge.due_day)
    end = min(until, charge.end_date) if charge.end_date else until
    step = {
        "daily": lambda d: d + timedelta(days=1),
        "weekly": lambda d: d + timedelta(weeks=1),
        "monthly": lambda d: _add_months(d, 1, charge.due_day),
        "quarterly": lambda d: _add_months(d, 3, charge.due_day),
        "yearly": lambda d: _add_months(d, 12, charge.due_day),
        "custom": lambda d: d + timedelta(days=max(1, charge.interval_days)),
    }[charge.frequency]
    guard = 0
    while current <= end and guard < 1000:
        yield current
        current = step(current)
        guard += 1


def generate_dues(horizon_days=62, charge=None):
    """Règle 8 : chaque charge active génère automatiquement ses échéances."""
    until = timezone.localdate() + timedelta(days=horizon_days)
    charges = [charge] if charge else RecurringCharge.objects.filter(status=RecurringCharge.Status.ACTIVE)
    created = 0
    for c in charges:
        existing = set(c.dues.values_list("due_date", flat=True))
        for day in occurrences(c, until):
            if day not in existing:
                Due.objects.create(charge=c, due_date=day, amount=c.amount, currency=c.currency)
                created += 1
    refresh_due_statuses()
    return created


def refresh_due_statuses():
    today = timezone.localdate()
    open_dues = Due.objects.exclude(status__in=[Due.Status.PAID, Due.Status.CANCELLED]).select_related("charge")
    for due in open_dues:
        if due.due_date < today:
            status = Due.Status.OVERDUE
        elif due.due_date <= today + timedelta(days=due.charge.remind_days_before):
            status = Due.Status.DUE_SOON
        else:
            status = Due.Status.UPCOMING
        if status != due.status:
            due.status = status
            due.save(update_fields=["status", "updated_at"])


@transaction.atomic
def pay_due(due, user, method=None, amount=None, cash_session=None):
    if due.status in (Due.Status.PAID, Due.Status.CANCELLED):
        raise BusinessError("Cette échéance est déjà réglée ou annulée.")
    charge = due.charge
    tx = record(direction="out", source=FinancialTransaction.Source.DUE, amount=amount or due.amount,
                currency=due.currency, agency=charge.agency, method=method, user=user,
                label=f"{charge.name} — échéance du {due.due_date:%d/%m/%Y}",
                category_code=charge.category.code, cash_session=cash_session, source_id=due.pk)
    due.transaction, due.status, due.paid_at, due.paid_by = tx, Due.Status.PAID, timezone.now(), user
    due.save()
    audit.log(user, "due.pay", "due", due, agency=charge.agency)
    return due
