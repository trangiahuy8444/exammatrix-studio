"""Explicit development/production configuration; no production secret defaults."""
import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit, unquote, parse_qs
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
PRODUCTION = os.environ.get('APP_ENV', 'development') == 'production'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '') + os.environ.get('DJANGO_SECRET_KEY_EXTRA', '')
ALLOWED_HOSTS = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', '').split(',') if h.strip()]
RENDER_HOST = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '').strip()
if RENDER_HOST and RENDER_HOST not in ALLOWED_HOSTS:
    if '/' in RENDER_HOST or '*' in RENDER_HOST or ':' in RENDER_HOST:
        raise ImproperlyConfigured('Invalid Render hostname.')
    ALLOWED_HOSTS.append(RENDER_HOST)
DATABASE_URL = os.environ.get('DATABASE_URL', '')
if PRODUCTION:
    if len(SECRET_KEY) < 50 or not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS or not DATABASE_URL:
        raise ImproperlyConfigured('Production requires a long secret, explicit hosts and a PostgreSQL DATABASE_URL.')
else:
    SECRET_KEY = SECRET_KEY or secrets.token_urlsafe(64)
    ALLOWED_HOSTS = ALLOWED_HOSTS or ['localhost', '127.0.0.1', 'testserver']
DEBUG = not PRODUCTION
DATA_DIR = Path(os.environ.get('CLOUD_DATA_DIR', BASE_DIR/'var'))
if DATABASE_URL:
    db = urlsplit(DATABASE_URL)
    if db.scheme not in ('postgres', 'postgresql') or not db.hostname or not db.path.strip('/'):
        raise ImproperlyConfigured('DATABASE_URL must identify a PostgreSQL database.')
    options = parse_qs(db.query)
    if PRODUCTION and options.get('sslmode', ['require'])[0] not in ('require', 'verify-ca', 'verify-full'):
        raise ImproperlyConfigured('Production PostgreSQL connections must use TLS.')
    DATABASES = {'default': {
        'ENGINE': 'django.db.backends.postgresql', 'NAME': unquote(db.path.lstrip('/')),
        'USER': unquote(db.username or ''), 'PASSWORD': unquote(db.password or ''),
        'HOST': db.hostname, 'PORT': db.port or 5432, 'CONN_MAX_AGE': 0 if PRODUCTION else 60,
        'CONN_HEALTH_CHECKS': True,
        'OPTIONS': {'sslmode': options.get('sslmode', ['require' if PRODUCTION else 'prefer'])[0], 'connect_timeout': 10},
    }}
else:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': DATA_DIR/'development.sqlite3'}}

INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'accounts', 'workspace', 'assessment', 'documents',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
if PRODUCTION:
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [BASE_DIR/'templates'],
              'APP_DIRS': True, 'OPTIONS': {'context_processors': [
                  'django.template.context_processors.request', 'django.contrib.auth.context_processors.auth',
                  'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE = 'vi'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True
STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR/'static']
STATIC_ROOT = BASE_DIR/'staticfiles'
if PRODUCTION:
    STORAGES = {'default': {'BACKEND':'django.core.files.storage.FileSystemStorage'},
                'staticfiles': {'BACKEND':'whitenoise.storage.CompressedManifestStaticFilesStorage'}}
MEDIA_ROOT = DATA_DIR/'private-media'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/app/'
LOGOUT_REDIRECT_URL = '/'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 8 * 60 * 60
SESSION_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_SECURE = PRODUCTION
SECURE_SSL_REDIRECT = PRODUCTION
SECURE_REDIRECT_EXEMPT = [r'^healthz$']
SECURE_HSTS_SECONDS = 31536000 if PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = PRODUCTION
SECURE_HSTS_PRELOAD = PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
CSRF_TRUSTED_ORIGINS = [v for v in os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if v]
if RENDER_HOST and ('https://'+RENDER_HOST) not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://'+RENDER_HOST)
if os.environ.get('TRUST_HTTPS_PROXY') == '1':
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'webmaster@localhost')
DATA_UPLOAD_MAX_MEMORY_SIZE = 16 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024

PRIVATE_SOURCE_MAX_BYTES = 8 * 1024 * 1024
PRIVATE_SOURCE_WORKSPACE_BYTES = 128 * 1024 * 1024
