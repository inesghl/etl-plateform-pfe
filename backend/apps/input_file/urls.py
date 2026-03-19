
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .view import InputFileViewSet

router = DefaultRouter()
router.register(r"input-files", InputFileViewSet, basename="input-file")

urlpatterns = [
    path('', include(router.urls)),
]


