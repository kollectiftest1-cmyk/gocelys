from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler


def exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": exc.messages}
        return Response(detail, status=status.HTTP_400_BAD_REQUEST)
    response = drf_handler(exc, context)
    if response is not None:
        extra = getattr(exc, "extra", None)
        if extra and isinstance(response.data, dict):
            response.data.update(extra)
        code = getattr(exc, "default_code", None)
        if isinstance(response.data, dict) and code and "code" not in response.data:
            response.data["code"] = code
    return response
