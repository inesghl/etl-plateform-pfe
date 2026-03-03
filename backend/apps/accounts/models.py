from django.contrib.auth.models import AbstractUser
from django.db import models




class User(AbstractUser):
    """
    Custom user model with role-based access control
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('user', 'User'),
    ]


    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default='user'
    )


    class Meta:
        db_table = 'users'
        ordering = ['username']


    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


    @property
    def is_admin(self):
        """
        Treat both explicit role 'admin' and Django superusers as admins.
        This makes  createsuperuser account behave as an admin in the API.
        """
        return self.is_superuser or self.role == 'admin'



