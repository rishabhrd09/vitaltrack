"""Preserve the socket peer so IngressGuard can authenticate proxy metadata."""

from uvicorn.workers import UvicornWorker


class CareKoshUvicornWorker(UvicornWorker):
    CONFIG_KWARGS = {**UvicornWorker.CONFIG_KWARGS, "proxy_headers": False}
