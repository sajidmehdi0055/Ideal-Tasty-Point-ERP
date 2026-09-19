import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `globals: true` is intentionally off (tests import describe/it/expect
// explicitly, matching backend/ convention), so Testing Library's
// auto-cleanup — which only wires itself up when it finds a global
// `afterEach` — never registers on its own. Without this, DOM from one
// test leaks into the next within the same file.
afterEach(() => {
  cleanup();
});

// jsdom has historically not implemented <dialog> behavior; shim it so
// components built on the native element (see design-system/Modal.tsx)
// are testable regardless of the jsdom version in use. Guarded so a real
// implementation, if present, is never overridden.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

// jsdom does not implement matchMedia at all; shim it so lib/use-media-query
// (used by the responsive app shell) is testable. Guarded so a real
// implementation is never overridden. Defaults to non-matching, i.e. tests
// see the narrow/mobile branch of any query unless a test overrides it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

