from contextvars import ContextVar

_request: ContextVar = ContextVar("gocelsys_request", default=None)


def current_request():
    return _request.get()


def current_ip():
    request = current_request()
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RequestContextMiddleware:
    """Expose la requête courante au journal d'audit."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _request.set(request)
        try:
            return self.get_response(request)
        finally:
            _request.reset(token)
