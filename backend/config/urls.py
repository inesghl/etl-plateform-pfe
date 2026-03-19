"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    # Core API prefix. Each app registers its own resources (etls, executions, etc.)
    # so the final URLs look like:
    #   /api/auth/login/
    #   /api/users/
    #   /api/etls/
    #   /api/executions/
    #   /api/input-files/
    #   /api/output-files/
    #   /api/notifications/
    path("api/", include("apps.accounts.urls")),

    path("api/", include("apps.etl.urls")),
    path("api/", include("apps.execution.urls")),
    path("api/", include("apps.input_file.urls")),
    path("api/", include("apps.output_file.urls")),
    path("api/", include("apps.notification.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
