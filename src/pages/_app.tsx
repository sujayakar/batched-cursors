import '@/styles/globals.css'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import type { AppProps } from 'next/app'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const clerkPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider publishableKey={clerkPk}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Component {...pageProps} />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
