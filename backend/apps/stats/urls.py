# stats/urls.py
from django.urls import path
from .views import DashboardStatsView, UserStatsView

urlpatterns = [
    path("dashboard/",  DashboardStatsView.as_view(), name="stats-dashboard"),
    path("my-stats/",   UserStatsView.as_view(),      name="stats-user"),
]