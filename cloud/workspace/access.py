from django.core.exceptions import ValidationError
from django.http import Http404
from django.shortcuts import get_object_or_404
from .models import Workspace


def workspace_for(user):
    if not user.is_authenticated or not user.is_active:
        raise Http404()
    return Workspace.objects.get_or_create(owner=user)[0]


def owned(queryset, user):
    if not user.is_authenticated or not user.is_active:
        return queryset.none()
    return queryset.filter(workspace__owner=user)


def get_owned(queryset, user, pk):
    try:
        return get_object_or_404(owned(queryset, user), pk=pk)
    except (ValidationError, ValueError, TypeError) as exc:
        raise Http404() from exc
