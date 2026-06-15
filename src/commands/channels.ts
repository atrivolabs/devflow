import { channelList } from "../lib/channels.js";
import { loadChannels } from "../lib/channel-source.js";

export async function listChannelsCmd(): Promise<void> {
  const channels = await loadChannels();
  console.log("\n  Available channels:\n");
  console.log(channelList(channels));
  console.log();
}
