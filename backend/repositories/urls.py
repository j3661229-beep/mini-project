from django.urls import include, path
from rest_framework.routers import DefaultRouter

from repositories.views import RepositoryViewSet

router = DefaultRouter()
router.register(r"repositories", RepositoryViewSet, basename="repository")

urlpatterns = [
    path("", include(router.urls)),
]
