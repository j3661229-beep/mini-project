from rest_framework.pagination import CursorPagination


class DefaultCursorPagination(CursorPagination):
    """
    Default cursor pagination for all viewsets.
    Uses 'created_at' (the actual field name on Repository and other models)
    instead of DRF's built-in default of 'created'.
    """
    ordering = "-created_at"
    page_size = 100
