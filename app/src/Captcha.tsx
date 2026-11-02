import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let widget: string | undefined;
    let disposed = false;
    const render = () => {
      if (disposed || !element.current || !window.turnstile || widget) return;
      widget = window.turnstile.render(element.current, {
        sitekey: siteKey, callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setError('Security check failed. Reload the page to retry.'); },
      });
    };
    const failed = () => setError('Security check could not load. Check your connection and reload.');
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.dataset.turnstile = 'true';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.append(script);
    }
    script.addEventListener('load', render); script.addEventListener('error', failed);
    render();
    return () => {
      disposed = true;
      script.removeEventListener('load', render); script.removeEventListener('error', failed);
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey, onToken]);
  return <><div ref={element} />{error && <p role="alert" className="error">{error}</p>}</>;
}
