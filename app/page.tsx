export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="mb-5 text-sm font-medium text-teal-700">Keycut for Tempo</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">See who can spend.<br />Cut unwanted access.</h1>
      <p className="mt-6 text-lg text-slate-600">The app is being built. This first milestone checks that the host can read Tempo testnet and mainnet.</p>
      <a className="mt-8 w-fit rounded-lg bg-teal-700 px-5 py-3 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700" href="/api/blocks">Check live block heights</a>
      <p className="mt-4 text-sm text-slate-600">Read-only RPC calls from the server. No wallet needed.</p>
    </main>
  )
}
