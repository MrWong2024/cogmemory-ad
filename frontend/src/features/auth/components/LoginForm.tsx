// frontend/src/features/auth/components/LoginForm.tsx
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/src/components/ui/Button';
import { AuthApiError, login } from '@/src/features/auth/api/auth-api';
import { useAuth } from '@/src/features/auth/hooks/use-auth';

const invalidCredentialsMessage = '账号或密码错误，或账号不可用。';
const serviceUnavailableMessage = '暂时无法连接认证服务，请稍后再试。';

export function LoginForm() {
  const router = useRouter();
  const { status } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const accountName = formData.get('accountName');
    const password = formData.get('password');

    if (typeof accountName !== 'string' || typeof password !== 'string') {
      setFormError(invalidCredentialsMessage);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      await login({
        accountName: accountName.trim(),
        password,
      });
      router.replace('/dashboard');
    } catch (error: unknown) {
      if (
        error instanceof AuthApiError &&
        error.code === 'invalid_credentials'
      ) {
        setFormError(invalidCredentialsMessage);
      } else {
        setFormError(serviceUnavailableMessage);
      }
      setIsSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div
        aria-live="polite"
        className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-5 text-base text-[var(--cma-muted)]"
        role="status"
      >
        正在确认登录状态...
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div
        aria-live="polite"
        className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-5 text-base font-medium text-[var(--cma-success)]"
        role="status"
      >
        已登录，正在进入工作台...
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      {status === 'error' ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-warning)]"
          role="status"
        >
          暂时无法确认现有登录状态，您仍可尝试登录。
        </p>
      ) : null}

      <div className="grid gap-2">
        <label
          className="text-base font-semibold text-[var(--cma-text-strong)]"
          htmlFor="accountName"
        >
          账号
        </label>
        <input
          autoComplete="username"
          className="min-h-12 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3.5 py-2.5 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]"
          disabled={isSubmitting}
          id="accountName"
          maxLength={120}
          name="accountName"
          placeholder="请输入机构分配的账号"
          required
          spellCheck={false}
          type="text"
        />
      </div>

      <div className="grid gap-2">
        <label
          className="text-base font-semibold text-[var(--cma-text-strong)]"
          htmlFor="password"
        >
          密码
        </label>
        <input
          autoComplete="current-password"
          className="min-h-12 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3.5 py-2.5 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]"
          disabled={isSubmitting}
          id="password"
          maxLength={256}
          name="password"
          placeholder="请输入密码"
          required
          type="password"
        />
      </div>

      {formError ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-danger)]"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
        {isSubmitting ? '正在登录...' : '登录系统'}
      </Button>
    </form>
  );
}
