import Head from 'next/head';
import { useEffect } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const handler = (e) => { console.error('Unhandled:', e.reason); };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Paste any job description. Get your fit score, gap analysis, tailored resume bullets, and outreach strategy in 15 seconds. Free, no sign-up required." />

        {/* OpenGraph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://astercopilot.com" />
        <meta property="og:title" content="Aster — Your Job Search Copilot" />
        <meta property="og:description" content="Paste any job description. Get your fit score, gap analysis, tailored resume bullets, and outreach strategy in 15 seconds. Free, no sign-up required." />
        <meta property="og:image" content="https://astercopilot.com/og-image.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Aster — Your Job Search Copilot" />
        <meta name="twitter:description" content="Paste any job description. Get your fit score, gap analysis, tailored resume bullets, and outreach strategy in 15 seconds. Free, no sign-up required." />
        <meta name="twitter:image" content="https://astercopilot.com/og-image.png" />
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </>
  );
}
