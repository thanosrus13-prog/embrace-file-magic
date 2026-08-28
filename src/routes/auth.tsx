import { createFileRoute } from "@tanstack/react-router";
import Auth from "../pages/Auth.jsx";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or sign up — VibePost" },
      {
        name: "description",
        content:
          "Create a VibePost account or sign in to keep your postcards, narratives and transcripts saved across devices.",
      },
      { property: "og:title", content: "Sign in or sign up — VibePost" },
      {
        property: "og:description",
        content: "One VibePost account for your postcards, narratives and transcripts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});
