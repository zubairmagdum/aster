import posthog from 'posthog-js';

export const initPosthog = () => {
  if (typeof window === 'undefined') return;
  try {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: 'https://us.i.posthog.com',
        capture_pageview: false,
        capture_pageleave: true,
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: { password: true, textarea: true },
        },
      });
    }
  } catch (e) {
    console.warn('PostHog init failed:', e.message);
  }
};

export const ph = {
  capture: (event, properties = {}) => {
    try {
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        posthog.capture(event, properties);
      }
    } catch {}
  },
  identify: (userId, traits = {}) => {
    try {
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        posthog.identify(userId, traits);
      }
    } catch {}
  },
  reset: () => {
    try {
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        posthog.reset();
      }
    } catch {}
  },
};
