import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/transcribe")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
