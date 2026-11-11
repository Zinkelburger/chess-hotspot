'use client';

import { useCallback, useState } from 'react';
import Icon from './Icon';

/** Native share sheet where there is one, otherwise copy the link. */
export default function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const share = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled, or sharing failed: fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', url);
    }
  }, [url, title]);

  return (
    <button
      type="button"
      onClick={share}
      className="pretty-pill pretty-pill-neutral"
      aria-label={`Share ${title}`}
    >
      <Icon name={copied ? 'check' : 'share'} size={14} />
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}
