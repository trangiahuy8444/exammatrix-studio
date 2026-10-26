from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, re_path
from django.contrib.auth.views import LogoutView, PasswordChangeView, PasswordChangeDoneView
from accounts.views import signup, TeacherLoginView
from workspace import views
from assessment import legacy_views

urlpatterns = [
    path('healthz', lambda request: JsonResponse({'status': 'ok'})), path('admin/', admin.site.urls),
    path('', views.home, name='home'), path('workspace/', views.dashboard, name='workspace'),
    path('workspace/<str:kind>/<uuid:pk>/', views.record_page),
    path('workspace/<str:kind>/<uuid:pk>/<str:action>/', views.record_page),
    path('accounts/signup/', signup, name='signup'),
    path('accounts/login/', TeacherLoginView.as_view(), name='login'),
    path('accounts/logout/', LogoutView.as_view(), name='logout'),
    path('accounts/password_change/', PasswordChangeView.as_view(), name='password_change'),
    path('accounts/password_change/done/', PasswordChangeDoneView.as_view(), name='password_change_done'),
    path('api/subjects/', views.subjects), path('api/subjects/<uuid:pk>/', views.subject_detail),
    path('api/curricula/', views.curricula), path('api/curricula/<uuid:pk>/', views.curriculum_detail),
    path('api/<str:kind>/<uuid:pk>/restore/', views.restore_record),
    path('app/', legacy_views.application, name='assessment_app'),
    path('api/<path:route>', legacy_views.original_api),
    re_path(r'^(?P<asset>(?:app\.js|core\.js|matrices\.js|curricula\.js|styles\.css|matrices\.css|assets/.+))$', legacy_views.source_asset),
]
