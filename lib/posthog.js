import posthog from 'posthog-js';

export const initPosthog = () => {
  if (typeof window === 'undefined') return;
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
};

export const ph = {
  capture: (event, properties = {}) => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.capture(event, properties);
    }
  },
  identify: (userId, traits = {}) => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.identify(userId, traits);
    }
  },
  reset: () => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.reset();
    }
  },
};
