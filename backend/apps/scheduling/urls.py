from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ETLScheduleViewSet

router = DefaultRouter()
router.register(r"schedules", ETLScheduleViewSet, basename="etlschedule")

urlpatterns = [
    path("", include(router.urls)),
]