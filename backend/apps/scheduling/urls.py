from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import ETLScheduleViewSet

router = SimpleRouter()
router.register(r"schedules", ETLScheduleViewSet, basename="etlschedule")
urlpatterns = [path("", include(router.urls))]