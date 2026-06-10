export interface Channel {
  name: string;
  description: string;
  url: string;
}

// YouTube live streams and long-running lofi/focus music
// These are stable, long-running streams that work well for background focus
export const channels: Record<string, Channel> = {
  deepfocus: {
    name: "Deep Focus",
    description: "Ambient electronic for deep work",
    url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", // lofi girl
  },
  synthwave: {
    name: "Synthwave",
    description: "Retro-futuristic synth vibes",
    url: "https://www.youtube.com/watch?v=4xDzrJKXOOY", // synthwave radio
  },
  jazz: {
    name: "Jazz",
    description: "Smooth jazz for calm sessions",
    url: "https://www.youtube.com/watch?v=HuFYqnbVbzY", // coffee shop jazz
  },
  classical: {
    name: "Classical",
    description: "Classical music for focused thinking",
    url: "https://www.youtube.com/watch?v=jgpJVI3tDbY", // classical radio
  },
  ambient: {
    name: "Ambient",
    description: "Atmospheric soundscapes",
    url: "https://www.youtube.com/watch?v=S_MOd40zlYU", // ambient music
  },
  silence: {
    name: "Silence",
    description: "Timer only, no music",
    url: "",
  },
};

export function getChannel(name: string): Channel | undefined {
  return channels[name.toLowerCase()];
}

export function listChannels(): Channel[] {
  return Object.values(channels);
}
