import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <title>Aster — Your career, in bloom.</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" />
        <script dangerouslySetInnerHTML={{ __html: `
          if (typeof window !== 'undefined' && window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
        `}} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
