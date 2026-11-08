from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import get_user_model


class SignupForm(UserCreationForm):
    email = forms.EmailField(label='Email')

    class Meta(UserCreationForm.Meta):
        model = get_user_model()
        fields = ['username', 'email']

    def clean_email(self):
        return self.cleaned_data['email'].strip().lower()
