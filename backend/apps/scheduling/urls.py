from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ETLScheduleViewSet, ScheduleRequestViewSet

router = DefaultRouter()
router.register(r"schedules",         ETLScheduleViewSet,    basename="etlschedule")
router.register(r"schedule-requests", ScheduleRequestViewSet, basename="schedulerequest")

urlpatterns = [
    path("", include(router.urls)),
]