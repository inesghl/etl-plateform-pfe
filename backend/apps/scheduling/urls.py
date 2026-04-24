"""
scheduling/urls.py
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ETLScheduleViewSet

router = DefaultRouter()
router.register("schedules", ETLScheduleViewSet, basename="schedule")

urlpatterns = [
    path("", include(router.urls)),
]