import { createFileRoute } from "@tanstack/react-router";
import Transcribe from "../pages/Transcribe.jsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VibePost — Audio in. Text out. Instantly." },
      {
        name: "description",
        content:
          "Upload or record audio and get an accurate, word-level transcript you can copy, edit, search and share.",
      },
      { property: "og:title", content: "VibePost — Audio in. Text out." },
      {
        property: "og:description",
        content: "Fast, accurate audio transcription with a searchable history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Transcribe,
});
