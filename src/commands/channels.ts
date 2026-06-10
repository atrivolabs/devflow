import { channelList } from "../lib/channels.js";

export async function listChannelsCmd(): Promise<void> {
  console.log("\n  Available channels:\n");
  console.log(channelList());
  console.log();
}
