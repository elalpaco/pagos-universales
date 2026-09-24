import Head from "next/head";
import { UserProvider } from "../lib/auth";
import { ToastProvider } from "../components/Toast";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <UserProvider>
      <ToastProvider>
        <Head>
          <title>Pagos Universales</title>
          <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%234338ca'/%3E%3Cpath d='M10 22V10.5a1 1 0 0 1 1-1h4.4a4.3 4.3 0 0 1 0 8.6H12' stroke='white' stroke-width='2.3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='21.5' cy='21.5' r='2' fill='white'/%3E%3C/svg%3E" />
        </Head>
        <Component {...pageProps} />
      </ToastProvider>
    </UserProvider>
  );
}
