import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "../pages/ResetPassword.jsx";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — VibePost" },
      {
        name: "description",
        content: "Choose a new password for your VibePost account and get back to your saved transcripts.",
      },
      { property: "og:title", content: "Reset your password — VibePost" },
      {
        property: "og:description",
        content: "Set a new password for your VibePost account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});
