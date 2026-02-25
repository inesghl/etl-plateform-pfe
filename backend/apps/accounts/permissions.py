from rest_framework import permissions




class IsAdmin(permissions.BasePermission):
    """
    Permission: Only admin users can access
    """
    message = 'Only administrators can perform this action.'


    def has_permission(self, request, view):
        return (
                request.user and
                request.user.is_authenticated and
                request.user.is_admin
        )




class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Permission: Owner of object or admin can access
    """
    message = 'You do not have permission to access this resource.'


    def has_object_permission(self, request, view, obj):
        # Admins can access anything
        if request.user.is_admin:
            return True


        # Check if obj is the user themselves
        if hasattr(obj, 'id'):
            return obj.id == request.user.id


        # Check if obj has a user/owner field
        if hasattr(obj, 'user'):
            return obj.user == request.user
        if hasattr(obj, 'launched_by'):
            return obj.launched_by == request.user
        if hasattr(obj, 'created_by'):
            return obj.created_by == request.user


        return False




class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Permission: Anyone can read, only admins can write
    """


    def has_permission(self, request, view):
        # Read permissions for authenticated users
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated


        # Write permissions only for admins
        return (
                request.user and
                request.user.is_authenticated and
                request.user.is_admin
        )



