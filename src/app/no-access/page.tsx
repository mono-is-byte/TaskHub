import Link from "next/link";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="tt-card max-w-sm p-6 text-center">
        <h1 className="text-xl font-bold">No access ⛔</h1>
        <p className="mt-2 text-sm text-muted">
          Your role does not allow this action, or you are not a member of this project.
        </p>
        <Link href="/" className="tt-btn-primary mt-4 inline-flex">
          Back to My Work
        </Link>
      </div>
    </div>
  );
}
