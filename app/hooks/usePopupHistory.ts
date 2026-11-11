'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** History state written by a popup so Back closes it instead of leaving the page. */
type PopupHistoryState = { popup?: boolean } | null;

const urlWithoutHash = () => window.location.pathname + window.location.search;

/**
 * One open listing (and the "several things here" list it may have come from),
 * kept in step with the URL hash and the browser's Back button.
 *
 * Opening from a closed state pushes a history entry, so a phone's Back gesture
 * closes the popup instead of leaving the site; moving between popups replaces
 * that entry. `replace` is for arriving by deep link: there is nothing to go
 * back to.
 */
export function usePopupHistory<T>(hashOf: (item: T) => string, find: (hash: string) => T | null) {
  const [active, setActive] = useState<T | null>(null);
  const [stack, setStack] = useState<T[] | null>(null);
  const findRef = useRef(find);
  findRef.current = find;

  const push = useCallback((url: string, replace = false) => {
    const state = window.history.state as PopupHistoryState;
    if (replace) window.history.replaceState(null, '', url);
    else if (state?.popup) window.history.replaceState({ popup: true }, '', url);
    else window.history.pushState({ popup: true }, '', url);
  }, []);

  const open = useCallback(
    (item: T, opts: { replace?: boolean; keepStack?: boolean } = {}) => {
      setActive(item);
      if (!opts.keepStack) setStack(null);
      push(urlWithoutHash() + hashOf(item), opts.replace);
    },
    [push, hashOf],
  );

  const openStack = useCallback(
    (items: T[]) => {
      setActive(null);
      setStack(items);
      push(urlWithoutHash());
    },
    [push],
  );

  const close = useCallback(() => {
    setActive(null);
    setStack(null);
    const state = window.history.state as PopupHistoryState;
    // Our own entry is popped; a deep link or reload has none, so drop the hash.
    if (state?.popup) window.history.back();
    else window.history.replaceState(null, '', urlWithoutHash());
  }, []);

  /** From one listing back to the list it was picked from. */
  const backToStack = useCallback(() => {
    setActive(null);
    window.history.replaceState(window.history.state, '', urlWithoutHash());
  }, []);

  // Back closes the popup; Forward reopens it from the hash its entry carries.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const state = e.state as PopupHistoryState;
      setActive(state?.popup ? findRef.current(window.location.hash) : null);
      setStack(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return { active, stack, open, openStack, close, backToStack };
}
