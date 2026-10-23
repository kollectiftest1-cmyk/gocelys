from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

from .models import User


def normalize_phone(value):
    digits = "".join(ch for ch in (value or "") if ch.isdigit() or ch == "+")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if digits.startswith("0") and len(digits) == 10:
        digits = "+243" + digits[1:]
    return digits


class IdentifierBackend(ModelBackend):
    """Connexion par nom d'utilisateur, e-mail ou téléphone."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = (username or kwargs.get("identifier") or "").strip()
        if not identifier or not password:
            return None
        phone = normalize_phone(identifier)
        query = Q(username__iexact=identifier) | Q(email__iexact=identifier)
        if len(phone) >= 9:
            query |= Q(phone=phone)
        for user in User.objects.filter(query)[:3]:
            if user.check_password(password) and self.user_can_authenticate(user):
                return user
        return None
