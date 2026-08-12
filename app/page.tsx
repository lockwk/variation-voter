export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-primary px-6 text-center">
      <h1 className="text-2xl font-semibold text-primary">Variation Voter</h1>
      <p className="max-w-md text-tertiary">
        This is a Variation Voter instance. Voters are created via the CLI or admin API and
        shared as direct links — there&apos;s nothing to do on this page.
      </p>
    </div>
  );
}
