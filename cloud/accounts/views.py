from django.conf import settings
from django.contrib.auth import login
from django.contrib.auth.views import LoginView
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods
from workspace.models import Workspace
from .forms import SignupForm
from .limits import consume_attempt


class TeacherLoginView(LoginView):
    template_name = 'registration/login.html'

    def post(self, request, *args, **kwargs):
        limit = getattr(settings, 'LOGIN_ATTEMPTS', 10)
        username = str(request.POST.get('username', ''))[:150].strip().casefold()
        ip = request.META.get('REMOTE_ADDR', '')
        if not consume_attempt('login-ip', ip, limit * 3) or not consume_attempt('login-user', username, limit):
            return HttpResponse('Bạn đã thử đăng nhập nhiều lần. Vui lòng thử lại sau 15 phút.', status=429)
        return super().post(request, *args, **kwargs)


@never_cache
@require_http_methods(['GET', 'POST'])
def signup(request):
    if request.user.is_authenticated:
        return redirect('workspace')
    if request.method == 'POST' and not consume_attempt('signup-ip', request.META.get('REMOTE_ADDR', ''), 10, 3600):
        return HttpResponse('Vui lòng thử đăng ký lại sau một giờ.', status=429)
    form = SignupForm(request.POST if request.method == 'POST' else None)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            user = form.save()
            Workspace.objects.create(owner=user)
        login(request, user)
        return redirect('workspace')
    return render(request, 'registration/signup.html', {'form': form})
