export interface Channel {
  id: string;
  name: string;
  description: string;
  icon: string;
  youtubeIds: string[];
}

// Synced with devflow.fm — same channels, same IDs
export const channels: Channel[] = [
  {
    id: "lofi",
    name: "lo-fi",
    description: "chill beats to code to",
    icon: "~",
    youtubeIds: ["5yx6BWlEVcY", "rPjez8z61rI"],
  },
  {
    id: "synthwave",
    name: "synthwave",
    description: "retro-futuristic focus",
    icon: ">",
    youtubeIds: ["4xDzrJKXOOY", "UedTcufyrHc"],
  },
  {
    id: "ambient",
    name: "ambient",
    description: "deep focus atmospheric",
    icon: "·",
    youtubeIds: ["S_MOd40zlYU", "7NOSDKb0HlU"],
  },
  {
    id: "jazz",
    name: "jazz-hop",
    description: "smooth jazz & hip-hop fusion",
    icon: "♪",
    youtubeIds: ["Dx5qFachd3A", "fEvM-OUbaKs"],
  },
  {
    id: "deepfocus",
    name: "deep-focus",
    description: "minimal techno for flow state",
    icon: "◉",
    youtubeIds: ["bkxLApqUSbo", "GxV0TggxqC8", "q3_yvs_T4Cc"],
  },
  {
    id: "classical",
    name: "classical",
    description: "timeless compositions",
    icon: "♫",
    youtubeIds: ["jgpJVI3tDbY", "mIYzp5rcTvU"],
  },
];

export function findChannel(query: string): Channel | undefined {
  const q = query.toLowerCase();
  return channels.find((c) => c.id === q || c.name === q);
}

export function channelList(): string {
  const maxId = Math.max(...channels.map((c) => c.id.length));
  return channels
    .map((c) => `  ${c.icon} ${c.id.padEnd(maxId + 1)} ${c.description}`)
    .join("\n");
}
