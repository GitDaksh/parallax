export default function Home() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      {/* Soft glow at the top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,rgba(255,255,255,0.08),transparent_70%)]"
      />

      <p className="rise inline-flex items-center gap-2 rounded-md border border-line px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse"
        />
        In development
      </p>

      <h1 className="rise mt-6 text-5xl font-semibold tracking-tight [--delay:80ms] sm:text-7xl">
        Parallax
      </h1>

      <p className="rise mt-5 max-w-md text-lg text-balance text-muted [--delay:160ms]">
        Turn any photo into a 3D window. Lean to the side and look around the
        subject.
      </p>

      <p className="rise mt-3 max-w-md text-sm text-balance text-muted [--delay:240ms]">
        AI depth and head tracking, running entirely in your browser. Your
        photos never leave your device.
      </p>

      <a
        href="https://github.com/GitDaksh/parallax"
        target="_blank"
        rel="noopener noreferrer"
        className="rise mt-10 rounded-md border border-line px-5 py-2.5 text-sm font-medium transition-colors duration-200 [--delay:320ms] hover:border-muted hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        Follow the build on GitHub
      </a>
    </main>
  );
}