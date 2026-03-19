
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OutputFileViewSet

router = DefaultRouter()
router.register(r"output-files", OutputFileViewSet, basename="output-file")

urlpatterns = [
    path('', include(router.urls)),
]


