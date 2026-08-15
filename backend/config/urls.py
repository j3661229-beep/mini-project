from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path


def root(_request):
    frontend = getattr(settings, "FRONTEND_URL", "http://127.0.0.1:5173")
    return HttpResponse(
        f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>GitPulse API</title>
<style>
  body{{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5;color:#0f1c14}}
  a{{color:#2d6a4f}} code{{background:#eef5ef;padding:.1rem .35rem;border-radius:4px}}
</style></head><body>
  <h1>GitPulse API</h1>
  <p>This is the Django backend. The interactive app lives on the frontend:</p>
  <p><a href="{frontend}">{frontend}</a></p>
  <p>API base: <code>/api/repositories/</code> · Admin: <a href="/admin/">/admin/</a></p>
</body></html>""",
        content_type="text/html",
    )


urlpatterns = [
    path("", root, name="root"),
    path("admin/", admin.site.urls),
    path("api/", include("repositories.urls")),
]
