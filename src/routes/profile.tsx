import { createFileRoute } from "@tanstack/react-router";
import Profile from "../pages/Profile.jsx";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — VibePost" },
      {
        name: "description",
        content:
          "View and search your saved VibePost transcriptions — live recordings and uploaded audio files, all in one place.",
      },
      { property: "og:title", content: "My Profile — VibePost" },
      {
        property: "og:description",
        content: "Your past transcriptions, searchable and saved to your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Profile,
});
