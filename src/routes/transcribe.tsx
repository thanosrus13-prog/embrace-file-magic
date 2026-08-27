import { createFileRoute } from "@tanstack/react-router";
import Transcribe from "../pages/Transcribe.jsx";

export const Route = createFileRoute("/transcribe")({
  head: () => ({
    meta: [
      { title: "Transcribe audio — VibePost" },
      {
        name: "description",
        content:
          "Upload an audio file and get an accurate, word-level transcript you can copy, edit and share.",
      },
      { property: "og:title", content: "Transcribe audio — VibePost" },
      {
        property: "og:description",
        content: "Fast, word-level audio transcription inside VibePost.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Transcribe,
});
