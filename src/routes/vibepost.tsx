import { createFileRoute } from "@tanstack/react-router";
import Home from "../pages/Home.jsx";

export const Route = createFileRoute("/vibepost")({
  head: () => ({
    meta: [
      { title: "VibePost postcards — Camera roll to narrative" },
      {
        name: "description",
        content:
          "Turn your photos into illustrated postcards with AI-written narratives, voice-over and printable memoirs.",
      },
      { property: "og:title", content: "VibePost postcards — Camera roll to narrative" },
      {
        property: "og:description",
        content:
          "Upload your photos and get an illustrated postcard with a personal story, narrated and ready to share.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
