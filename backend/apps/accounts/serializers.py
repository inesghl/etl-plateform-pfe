from rest_framework import serializers
from .models import User




class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'is_admin', 'first_name', 'last_name']
        read_only_fields = ['id']

    def get_is_admin(self, obj):
        return obj.is_admin




class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)


    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'role']


    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user



