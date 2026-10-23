from decimal import Decimal


def fmt_money(amount, currency="CDF"):
    """Montant à la française : 150 000 CDF · 1 250,50 USD."""
    value = Decimal(str(amount or 0))
    digits = 2 if currency == "USD" and value != value.to_integral() else 0
    text = f"{value:,.{digits}f}".replace(",", " ").replace(".", ",")
    return f"{text} {currency}"


def fmt_qty(value):
    """Quantité lisible : 8 · 12,5 (sans zéros superflus)."""
    value = Decimal(str(value or 0)).normalize()
    if value == value.to_integral():
        return f"{int(value):,}".replace(",", " ")
    return f"{value:f}".replace(".", ",")
