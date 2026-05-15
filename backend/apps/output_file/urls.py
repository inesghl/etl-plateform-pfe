from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import OutputFileViewSet

router = SimpleRouter()
router.register(r"output-files", OutputFileViewSet, basename="output-file")
urlpatterns = [path('', include(router.urls))]