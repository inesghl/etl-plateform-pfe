from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import NotificationViewSet

router = SimpleRouter()
router.register(r"notifications", NotificationViewSet, basename="notification")
urlpatterns = [path('', include(router.urls))]