import { createFileRoute } from "@tanstack/react-router";
import Home from "../pages/Home.jsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VibePost — Camera roll to narrative on demand" },
      {
        name: "description",
        content:
          "Turn your photos into illustrated postcards with AI-written narratives, voice-over and printable memoirs.",
      },
      { property: "og:title", content: "VibePost — Camera roll to narrative" },
      {
        property: "og:description",
        content:
          "Upload your camera roll and get a postcard with a personal story, narrated and ready to share.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
