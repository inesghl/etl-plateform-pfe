from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import ExecutionViewSet

router = SimpleRouter()
router.register(r"executions", ExecutionViewSet, basename="execution")
urlpatterns = [path('', include(router.urls))]