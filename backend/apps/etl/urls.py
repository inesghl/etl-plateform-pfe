from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import ETLViewSet

router = SimpleRouter()
router.register(r"etls", ETLViewSet, basename="etl")
urlpatterns = [path('', include(router.urls))]