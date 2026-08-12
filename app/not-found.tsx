export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-primary px-6 text-center">
      <h1 className="text-2xl font-semibold text-primary">Not found</h1>
      <p className="max-w-md text-tertiary">
        This page doesn&apos;t exist, or the voter it belonged to has expired.
      </p>
    </div>
  );
}
