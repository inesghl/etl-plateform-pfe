from rest_framework import serializers
from .models import User




class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'first_name', 'last_name']
        read_only_fields = ['id']




class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)


    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'role']


    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user



