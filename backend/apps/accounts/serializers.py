# accounts/serializers.py
from rest_framework import serializers
from .models import User, UserGroup


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
        return User.objects.create_user(**validated_data)


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