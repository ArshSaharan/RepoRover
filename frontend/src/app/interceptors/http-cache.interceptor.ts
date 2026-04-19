import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';

type CachedHttpEntry = {
  cachedAt: number;
  status: number;
  body: unknown;
};

const CACHE_PREFIX = 'rr:http-cache:';
const DEFAULT_TTL_MS = 60 * 1000;

function resolveTtl(url: string): number {
  if (url.includes('/ai/recommendations')) return 5 * 60 * 1000;
  if (url.includes('/ai/repo-intel/brief')) return 10 * 60 * 1000;
  if (url.includes('/ai/repo-intel/deep')) return 10 * 60 * 1000;
  if (url.includes('/auth/github/profile')) return 5 * 60 * 1000;
  if (url.includes('/auth/github/discover')) return 5 * 60 * 1000;
  if (url.includes('/auth/github/contributions')) return 2 * 60 * 1000;
  if (url.includes('/users/me/saved-repos')) return 45 * 1000;
  return DEFAULT_TTL_MS;
}

function shouldBypassCache(url: string, forceHeader: string | null): boolean {
  if (url.includes('force_refresh=true')) return true;
  if ((forceHeader || '').toLowerCase() === 'true') return true;
  return false;
}

function buildCacheKey(url: string, authHeader: string | null): string {
  const authSuffix = authHeader ? authHeader.slice(-24) : 'anon';
  return `${CACHE_PREFIX}${url}::${authSuffix}`;
}

export const httpCacheInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  if (req.method !== 'GET') {
    return next(req);
  }

  const skipCache = (req.headers.get('x-skip-cache') || '').toLowerCase() === 'true';
  if (skipCache || typeof localStorage === 'undefined') {
    return next(req);
  }

  const forceHeader = req.headers.get('x-force-refresh');
  if (shouldBypassCache(req.urlWithParams, forceHeader)) {
    return next(req);
  }

  const cacheKey = buildCacheKey(req.urlWithParams, req.headers.get('Authorization'));
  const ttlMs = resolveTtl(req.urlWithParams);

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as CachedHttpEntry;
      if (cached && typeof cached.cachedAt === 'number' && Date.now() - cached.cachedAt < ttlMs) {
        return of(
          new HttpResponse({
            body: cached.body,
            status: cached.status,
            url: req.urlWithParams,
          })
        );
      }
    }
  } catch {
    // Ignore cache parsing/storage errors and continue with network request.
  }

  return next(req).pipe(
    tap((event) => {
      if (!(event instanceof HttpResponse)) {
        return;
      }
      if (event.status < 200 || event.status >= 300) {
        return;
      }

      const payload: CachedHttpEntry = {
        cachedAt: Date.now(),
        status: event.status,
        body: event.body,
      };

      try {
        localStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch {
        // Best-effort cache only.
      }
    })
  );
};
