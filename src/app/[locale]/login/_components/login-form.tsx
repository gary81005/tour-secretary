'use client';

import type { AuthError } from '@supabase/supabase-js';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

export type LoginErrorKey =
  'oauth' | 'link' | 'rateLimited' | 'invalidEmail' | 'invalidCode' | 'unknown';

// 與 supabase/config.toml 的 otp_length、雲端 Dashboard 的 Email OTP Length 一致。
const OTP_LENGTH = 6;

function toErrorKey(error: AuthError, fallback: LoginErrorKey): LoginErrorKey {
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') return 'rateLimited';
  if (error.code === 'email_address_invalid') return 'invalidEmail';
  if (error.code === 'otp_expired') return 'invalidCode';
  return fallback;
}

// Google 登入完成後回到 /auth/callback，再由 Route Handler 導回 next。
function oauthRedirectUrl(next: string) {
  const url = new URL('/auth/callback', window.location.origin);
  url.searchParams.set('next', next);
  return url.href;
}

type Props = {
  next: string;
  initialError: LoginErrorKey | null;
};

// 登入流程（Q1 (c)）：Google，或 Email → 同一封信裡有連結與 6 位數驗證碼。
// PWA 裡點連結常會開到外部瀏覽器，所以驗證碼要能直接在這裡輸入。
export function LoginForm({ next, initialError }: Props) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [error, setError] = useState<LoginErrorKey | null>(initialError);
  const [resent, setResent] = useState(false);
  const codeFormRef = useRef<HTMLFormElement>(null);

  async function signInWithGoogle() {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectUrl(next) },
    });
    // 成功時瀏覽器會直接轉到 Google，不會回到這裡。
    if (error) setError('oauth');
  }

  async function sendEmail(address: string) {
    // 信中連結固定是 {{ .SiteURL }}/auth/confirm（supabase/templates/），不帶 emailRedirectTo：
    // 點連結登入後回首頁，輸入驗證碼登入才會回到 next。
    const { error } = await createClient().auth.signInWithOtp({ email: address });
    if (error) {
      setError(toErrorKey(error, 'unknown'));
      return false;
    }
    setError(null);
    return true;
  }

  async function submitEmail(formData: FormData) {
    const address = String(formData.get('email') ?? '').trim();
    setEmail(address);
    setResent(false);
    if (await sendEmail(address)) setStep('code');
  }

  async function resend() {
    setCode('');
    setResent(await sendEmail(email));
  }

  async function submitCode() {
    const { error } = await createClient().auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) {
      setError(toErrorKey(error, 'invalidCode'));
      setCode('');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  function changeEmail() {
    setStep('email');
    setCode('');
    setError(null);
    setResent(false);
  }

  const errorMessage = error && (
    <p role='alert' className='text-sm text-destructive'>
      {t(`errors.${error}`)}
    </p>
  );

  if (step === 'code') {
    return (
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <h2 className='text-lg font-semibold'>{t('codeSentTitle')}</h2>
          <p className='text-sm text-muted-foreground'>{t('codeSentDescription', { email })}</p>
        </div>

        <form ref={codeFormRef} action={submitCode} className='flex flex-col gap-4'>
          <Field>
            <FieldLabel htmlFor='code'>{t('codeLabel')}</FieldLabel>
            <InputOTP
              id='code'
              name='code'
              maxLength={OTP_LENGTH}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode='numeric'
              autoComplete='one-time-code'
              autoFocus
              value={code}
              onChange={setCode}
              onComplete={() => codeFormRef.current?.requestSubmit()}
              aria-invalid={error === 'invalidCode'}
            >
              <InputOTPGroup>
                {Array.from({ length: OTP_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className='size-11 text-base' />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </Field>
          {errorMessage}
          <SubmitButton disabled={code.length < OTP_LENGTH}>{t('verifyCode')}</SubmitButton>
        </form>

        <div className='flex items-center justify-between text-sm'>
          <Button variant='link' className='px-0' onClick={changeEmail}>
            {t('changeEmail')}
          </Button>
          <form action={resend}>
            <SubmitButton variant='link' className='px-0'>
              {resent ? t('resent') : t('resend')}
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6'>
      <form action={signInWithGoogle}>
        <SubmitButton variant='outline' className='w-full'>
          <GoogleIcon />
          {t('continueWithGoogle')}
        </SubmitButton>
      </form>

      <FieldSeparator>{t('or')}</FieldSeparator>

      <form action={submitEmail} className='flex flex-col gap-4'>
        <Field>
          <FieldLabel htmlFor='email'>{t('emailLabel')}</FieldLabel>
          <Input
            id='email'
            name='email'
            type='email'
            inputMode='email'
            autoComplete='email'
            placeholder={t('emailPlaceholder')}
            defaultValue={email}
            required
            className='h-11 text-base'
            aria-invalid={error === 'invalidEmail'}
          />
        </Field>
        {errorMessage}
        <SubmitButton className='w-full'>{t('sendEmail')}</SubmitButton>
      </form>
    </div>
  );
}

// 送出中停用按鈕，避免重複寄信或重複驗證。
function SubmitButton({
  children,
  disabled,
  variant,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'link';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type='submit'
      size='lg'
      variant={variant}
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {children}
    </Button>
  );
}

// Google 品牌規範要求使用原色 logo，這是唯一不走主題 token 的顏色。
function GoogleIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true'>
      <path
        fill='#4285F4'
        d='M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z'
      />
      <path
        fill='#34A853'
        d='M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z'
      />
      <path
        fill='#FBBC05'
        d='M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4.01-3.11Z'
      />
      <path
        fill='#EA4335'
        d='M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.94 11.94 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z'
      />
    </svg>
  );
}
