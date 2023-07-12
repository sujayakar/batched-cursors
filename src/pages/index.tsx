import Image from 'next/image'
import { Inter } from 'next/font/google'
import BatchedCursors from '@/BatchedCursors'
import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react'
import { SignInButton } from '@clerk/clerk-react'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-between p-24 ${inter.className}`}
    >
    <Unauthenticated>
      <div className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
        <SignInButton mode="modal">
          Sign in to Batched Cursors™
        </SignInButton>
      </div>
    </Unauthenticated>
    <AuthLoading>
      Logging in...
    </AuthLoading>
    <Authenticated>
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1>Batched cursors</h1>
        <h2>So smooth</h2>
        <h3>Wow</h3>
      </div>

        <div className="relative flex place-items-center">
          <BatchedCursors/>
        </div>

        <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left">

        </div>
    </Authenticated>
    </main>
  )
}
