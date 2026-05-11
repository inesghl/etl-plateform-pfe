# accounts/serializers.py
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, UserGroup


class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'role', 'is_admin',
            'first_name', 'last_name', 'is_active', 'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def get_is_admin(self, obj):
        return obj.is_admin


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'role']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Lets a regular user update their own profile:
    first_name, last_name, email, and optionally change their password.
    """
    current_password = serializers.CharField(write_only=True, required=False)
    new_password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'current_password', 'new_password']

    def validate(self, attrs):
        new_password = attrs.get('new_password')
        current_password = attrs.get('current_password')

        if new_password:
            if not current_password:
                raise serializers.ValidationError(
                    {'current_password': 'Required when changing password.'}
                )
            user = self.context['request'].user
            if not user.check_password(current_password):
                raise serializers.ValidationError(
                    {'current_password': 'Incorrect password.'}
                )
            validate_password(new_password, user)

        return attrs

    def update(self, instance, validated_data):
        validated_data.pop('current_password', None)
        new_password = validated_data.pop('new_password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if new_password:
            instance.set_password(new_password)

        instance.save()
        return instance


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """
    Lets an admin edit any user's details (except password — use set_password action).
    """
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'role', 'is_active', 'username']


class UserGroupSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    member_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        write_only=True,
        source='members',
        required=False,
    )
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = UserGroup
        fields = [
            'id', 'name', 'description',
            'members', 'member_ids', 'member_count',
            'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']

    def get_member_count(self, obj):
        return obj.members.count()